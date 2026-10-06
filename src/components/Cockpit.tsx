import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Agent, AgentOverride, TermLine } from '../types';
import type { CloudMessage } from '../lib/uplink';
import { MISSION_PICKS } from '../data/terminalScripts';
import { Terminal } from './Terminal';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import { absTime, branchUrl, plainStatus, relTime, repoShort, updatedAt } from '../lib/agentView';
import { shipFor } from '../lib/art';
import { Icon } from './Icon';
import './Cockpit.css';

export type ConvoState = { status: 'idle' | 'loading' | 'ok' | 'error'; error?: string };

interface CockpitProps {
  agent: Agent;
  override: AgentOverride | undefined;
  lines: TermLine[];
  uplink: UplinkInfo;
  /** Live run stream state for real units (LIVE / POLLING indicator) */
  link?: { state: 'connecting' | 'live' | 'polling' | 'ended' | 'error'; reason?: string } | null;
  /** A command is in flight to the uplink */
  busy?: boolean;
  assignOpen: boolean;
  onAssignOpenChange: (open: boolean) => void;
  onClose: () => void;
  onHoldToggle: () => void;
  onAssign: (mission: string) => void;
  onRetreat: () => void;
  onApprove: () => void;
  onTerminalSubmit: (input: string) => void;
  /** Park this unit in the archive tray (board only) */
  onArchive?: () => void;
  archived?: boolean;
  /** Real agents: full transcript from the uplink */
  messages?: CloudMessage[];
  convo?: ConvoState;
  /** Real agents: send a follow-up; resolves true when Cursor accepted it */
  onSendFollowup?: (text: string) => Promise<boolean>;
  now?: number;
  /** Replay: scripted, no real links */
  demo?: boolean;
}

function Bar({ label, value, tone }: { label: string; value: number; tone: 'hp' | 'tok' | 'prog' }) {
  return (
    <div className="cockpit__bar">
      <span>{label}</span>
      <div className="cockpit__bar-track">
        <div className={`cockpit__bar-fill cockpit__bar-fill--${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="cockpit__bar-val">{Math.round(value)}%</span>
    </div>
  );
}

function Conversation({ messages, convo, online, real }: { messages: CloudMessage[]; convo?: ConvoState; online: boolean; real: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  const shown = messages.filter((m) => m.text.trim());
  return (
    <div
      ref={ref}
      className="convo"
      tabIndex={0}
      aria-label="Conversation with the agent"
      aria-live="polite"
      onScroll={(e) => {
        const el = e.currentTarget;
        stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
      }}
    >
      {!real ? (
        <p className="convo__empty">Simulated units have no real conversation. See the terminal log.</p>
      ) : !online && shown.length === 0 ? (
        <p className="convo__empty">Not connected to Cursor, so the conversation cannot be loaded.</p>
      ) : convo?.status === 'error' && shown.length === 0 ? (
        <p className="convo__empty convo__empty--err">
          <Icon name="alert" /> Could not load the conversation: {convo.error}
        </p>
      ) : shown.length === 0 ? (
        <p className="convo__empty">
          <span className="conn__spinner" aria-hidden /> {convo?.status === 'ok' ? 'No messages yet.' : 'Loading conversation…'}
        </p>
      ) : (
        shown.map((m) => (
          <div key={m.id} className={`convo__msg convo__msg--${m.type}`}>
            <span className="convo__who">{m.type === 'user' ? 'You' : m.type === 'status' ? 'Status' : 'Agent'}</span>
            <div className="convo__text">{m.text}</div>
          </div>
        ))
      )}
    </div>
  );
}

export function Cockpit({
  agent,
  override,
  lines,
  uplink,
  link,
  busy,
  assignOpen,
  onAssignOpenChange,
  onClose,
  onHoldToggle,
  onAssign,
  onRetreat,
  onApprove,
  onTerminalSubmit,
  onArchive,
  archived,
  messages = [],
  convo,
  onSendFollowup,
  now = Date.now(),
  demo,
}: CockpitProps) {
  const held = !!override?.held || !!agent.held;
  const cloudId = agent.cloudId;
  const real = !!cloudId;
  const online = uplink.phase === 'online';
  const st = plainStatus(agent);
  /** Only a live run can be stopped; finished / failed / launching agents have nothing to stop. */
  const stoppable = !agent.pending && st.group !== 'done' && st.label !== 'Failed';
  const [tab, setTab] = useState<'convo' | 'log'>(real ? 'convo' : 'log');
  const [custom, setCustom] = useState('');
  const [followup, setFollowup] = useState('');
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const customRef = useRef<HTMLInputElement>(null);
  const followRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => setTab(real ? 'convo' : 'log'), [agent.id, real]);
  // While the run streams LIVE the transcript poll pauses, so show the streaming terminal instead.
  const streaming = link?.state === 'live' || link?.state === 'polling';
  useEffect(() => {
    if (streaming) setTab('log');
  }, [streaming]);
  useEffect(() => {
    if (assignOpen) window.setTimeout(() => (real ? followRef.current : customRef.current)?.focus(), 30);
  }, [assignOpen, real]);

  const submitFollowup = async () => {
    const t = followup.trim();
    if (!t || busy || sending) return;
    if (onSendFollowup) {
      setSending(true);
      const ok = await onSendFollowup(t);
      setSending(false);
      if (ok) {
        setFollowup('');
        onAssignOpenChange(false);
      }
    } else {
      onAssign(t);
      setFollowup('');
    }
  };

  const submitCustom = () => {
    const m = custom.trim();
    if (!m) return;
    onAssign(m);
    setCustom('');
  };

  const c = agent.cloud;
  const url = c?.url ?? agent.live?.url;
  const prompt = messages.find((m) => m.type === 'user')?.text;
  const upd = updatedAt(agent);
  const created = Date.parse(c?.createdAt ?? '') || undefined;
  const bUrl = branchUrl(c?.repo, c?.branch);
  const raw = c?.rawStatus ?? agent.live?.rawState;
  const canSend = online && !busy && !sending && !!followup.trim();

  return (
    <aside className={`cockpit hud-panel cockpit--${agent.status.toLowerCase()}`} role="dialog" aria-label={`${agent.name} details`} aria-modal="false">
      <header className="cockpit__head">
        <div className="cockpit__glyph" aria-hidden>
          <img src={shipFor(agent.id)} alt="" width={40} height={26} />
        </div>
        <div className="cockpit__ident">
          <div className="cockpit__name-row">
            <h2>{agent.name}</h2>
            <span className={`status-chip status-chip--${st.tone}`} title={st.hint}>
              <Icon name={st.icon} /> {st.label}
            </span>
            {!real && <span className="tag tag--sim">SIMULATED</span>}
            {agent.live && <span className="cockpit__badge cockpit__badge--live">◉ LIVE FILE</span>}
            {real && (
              <span className={`cockpit__badge cockpit__badge--${online ? 'cmd' : 'cmdoff'}`} title="Command uplink to the real cloud agent">
                {online ? '⇅ CONNECTED' : uplink.phase === 'checking' ? '⇅ CONNECTING' : '⇅ NOT CONNECTED'}
              </span>
            )}
          </div>
          <div className="cockpit__task plain" title={agent.mission}>
            {agent.mission}
          </div>
        </div>
        {onArchive && (
          <button
            type="button"
            className="cockpit__archive"
            onClick={onArchive}
            title={archived ? 'Put back on the active roster (board only)' : 'Hide in the archive tray (board only, nothing is sent to the agent)'}
          >
            <Icon name={archived ? 'recall' : 'archive'} /> {archived ? 'Restore' : 'Archive'}
          </button>
        )}
        <button type="button" className="cockpit__close" onClick={onClose} aria-label="Close details (Esc)" title="Close (Esc)">
          ✕
        </button>
      </header>

      {st.group === 'attention' && (
        <div className="cockpit__problem" role="alert">
          <Icon name="alert" />
          <div>
            <b>{st.label}.</b> {st.hint}
            {real && c?.summary && <div className="cockpit__problem-sum">Last summary: {c.summary}</div>}
          </div>
        </div>
      )}

      {real ? (
        <section className="cockpit__details" aria-label="Agent details">
          <dl>
            <div>
              <dt>Status</dt>
              <dd>
                {st.label}
                {raw && <span className="cockpit__raw"> ({raw})</span>}
              </dd>
            </div>
            <div>
              <dt>Repository</dt>
              <dd>
                {c?.repo ? (
                  <a href={c.repo} target="_blank" rel="noreferrer">
                    <Icon name="repo" /> {repoShort(c.repo)}
                  </a>
                ) : (
                  '—'
                )}
                {c?.ref && <span className="cockpit__raw"> from {c.ref}</span>}
              </dd>
            </div>
            <div>
              <dt>Branch</dt>
              <dd className="cockpit__ellipsis">
                {c?.branch ? (
                  bUrl ? (
                    <a href={bUrl} target="_blank" rel="noreferrer" title={c.branch}>
                      <Icon name="branch" /> {c.branch}
                    </a>
                  ) : (
                    <span title={c.branch}>{c.branch}</span>
                  )
                ) : (
                  <span className="cockpit__raw">none yet</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Pull request</dt>
              <dd>
                {c?.prUrl ? (
                  <a href={c.prUrl} target="_blank" rel="noreferrer">
                    <Icon name="pr" /> {c.prUrl.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                  </a>
                ) : (
                  <span className="cockpit__raw" title="Agents launched from this board never open a PR automatically">none</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd title={absTime(upd)}>
                {upd ? `${relTime(upd, now)} · ${absTime(upd)}` : '—'}
                {created && <span className="cockpit__raw"> · created {absTime(created)}</span>}
              </dd>
            </div>
            <div>
              <dt>Agent id</dt>
              <dd className="cockpit__ellipsis">
                <code>{cloudId}</code>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => {
                    void navigator.clipboard?.writeText(cloudId!).then(
                      () => (setCopied(true), window.setTimeout(() => setCopied(false), 1500)),
                      () => {},
                    );
                  }}
                  aria-label="Copy agent id"
                >
                  {copied ? 'copied' : 'copy'}
                </button>
              </dd>
            </div>
            {prompt && (
              <div className="cockpit__prompt-row">
                <dt>Prompt</dt>
                <dd>
                  <div className={`cockpit__prompt${promptOpen ? ' is-open' : ''}`}>{prompt}</div>
                  {prompt.length > 160 && (
                    <button type="button" className="link-btn" onClick={() => setPromptOpen((o) => !o)} aria-expanded={promptOpen}>
                      {promptOpen ? 'show less' : 'show all'}
                    </button>
                  )}
                </dd>
              </div>
            )}
          </dl>
          <div className="cockpit__links">
            {url && !demo && (
              <a href={url} target="_blank" rel="noreferrer" className="tool-btn">
                Open in Cursor ↗
              </a>
            )}
            {c?.prUrl && (
              <a href={c.prUrl} target="_blank" rel="noreferrer" className="tool-btn tool-btn--go">
                <Icon name="pr" /> View PR ↗
              </a>
            )}
            {bUrl && (
              <a href={bUrl} target="_blank" rel="noreferrer" className="tool-btn">
                <Icon name="branch" /> Branch ↗
              </a>
            )}
            {busy && <span className="cockpit__busy">Sending to Cursor…</span>}
          </div>
        </section>
      ) : (
        <section className="cockpit__stats">
          <div className="cockpit__activity">
            <span>NOW</span>
            <em>{agent.activity}</em>
          </div>
          <Bar label="PROG" value={agent.progress} tone="prog" />
          <Bar label="HP" value={agent.hp} tone="hp" />
          <Bar label="TOK" value={agent.tokens} tone="tok" />
          {agent.live && (
            <div className="cockpit__uplink">
              <div>
                <span className="cockpit__uplink-tag">STATUS FILE</span> state <b>{agent.live.rawState}</b> · updated {new Date(agent.live.updatedAt).toLocaleTimeString('en-GB')}
              </div>
              {!demo && (
                <a href={agent.live.url} target="_blank" rel="noreferrer" className="cockpit__open">
                  Open in Cursor ↗
                </a>
              )}
            </div>
          )}
        </section>
      )}

      {real && (
        <div className="cockpit__tabs" role="tablist" aria-label="Agent output">
          <button type="button" role="tab" aria-selected={tab === 'convo'} className={tab === 'convo' ? 'is-active' : ''} onClick={() => setTab('convo')}>
            <Icon name="followup" /> Conversation{messages.length ? ` (${messages.filter((m) => m.text.trim()).length})` : ''}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'log'} className={tab === 'log' ? 'is-active' : ''} onClick={() => setTab('log')}>
            <Icon name="running" /> {streaming ? 'Live run' : 'Terminal log'}
          </button>
        </div>
      )}

      {real && tab === 'convo' ? (
        <Conversation messages={messages} convo={convo} online={online} real={real} />
      ) : (
        <Terminal key={agent.id} agentName={agent.name} status={agent.status} held={held} lines={lines} onSubmit={onTerminalSubmit} link={link} />
      )}

      {real && (
        <form
          className={`cockpit__composer${assignOpen ? ' is-focused' : ''}`}
          onSubmit={(e) => {
            e.preventDefault();
            void submitFollowup();
          }}
        >
          <label htmlFor={`fu-${agent.id}`} className="sr-only">
            Follow-up message for {agent.name}
          </label>
          <textarea
            id={`fu-${agent.id}`}
            ref={followRef}
            className="cockpit__followup"
            rows={2}
            value={followup}
            disabled={!online && !demo}
            placeholder={online || demo ? `Send a follow-up to ${agent.name}… (Enter sends, Shift+Enter new line)` : 'Not connected to Cursor: follow-ups are disabled'}
            onChange={(e) => setFollowup(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void submitFollowup();
              }
              if (e.key === 'Escape') {
                onAssignOpenChange(false);
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
          />
          <button type="submit" className="tool-btn tool-btn--go" disabled={!canSend} aria-label={`Send follow-up to ${agent.name}`}>
            <Icon name="followup" /> {sending || busy ? 'Sending…' : 'Send'}
          </button>
        </form>
      )}

      {assignOpen && !real && (
        <div className="cockpit__picker" role="dialog" aria-label="Assign a simulated task">
          <div className="cockpit__picker-head">
            <span>ASSIGN TASK → {agent.name} (SIMULATED)</span>
            <button type="button" onClick={() => onAssignOpenChange(false)} aria-label="Cancel">
              ✕
            </button>
          </div>
          <div className="cockpit__picks">
            {MISSION_PICKS.map((m) => (
              <button type="button" key={m} className={m === agent.mission ? 'is-current' : ''} onClick={() => onAssign(m)}>
                {m}
              </button>
            ))}
          </div>
          <div className="cockpit__custom">
            <input
              ref={customRef}
              value={custom}
              placeholder="Custom task…"
              aria-label="Custom task"
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') submitCustom();
                if (e.key === 'Escape') onAssignOpenChange(false);
              }}
            />
            <button type="button" onClick={submitCustom}>
              ASSIGN
            </button>
          </div>
        </div>
      )}

      <footer className="cockpit__actions">
        {real ? (
          <>
            <button type="button" className="ck-btn ck-btn--danger" onClick={onRetreat} disabled={busy || !stoppable} title={stoppable ? "Stop the agent's current run. Asks for confirmation; the agent is not deleted." : 'Nothing to stop: this run is not active.'}>
              <Icon name="stop" /> Stop agent
              <kbd>R</kbd>
            </button>
            <button type="button" className="ck-btn ck-btn--go" onClick={onApprove} disabled={busy} title='Sends the follow-up "Approved, proceed." (asks first)'>
              <Icon name="approve" /> Approve plan
              <kbd>P</kbd>
            </button>
            <button
              type="button"
              className={`ck-btn${held ? ' ck-btn--on' : ''}`}
              onClick={onHoldToggle}
              title="Local only: pauses board updates for this agent. The cloud agent keeps running."
            >
              <Icon name={held ? 'running' : 'pause'} /> {held ? 'Resume board' : 'Pause board'}
              <kbd>H</kbd>
            </button>
          </>
        ) : (
          <>
            <button type="button" className="ck-btn" onClick={() => onAssignOpenChange(!assignOpen)} title="Give this simulated unit a new task">
              <Icon name="followup" /> Assign task
              <kbd>A</kbd>
            </button>
            <button type="button" className={`ck-btn${held ? ' ck-btn--on' : ''}`} onClick={onHoldToggle} title="Freeze / resume this simulated unit">
              <Icon name={held ? 'running' : 'pause'} /> {held ? 'Resume' : 'Hold'}
              <kbd>H</kbd>
            </button>
            <button type="button" className="ck-btn ck-btn--warn" onClick={onRetreat} title="Send back to the rally point">
              <Icon name="recall" /> Recall
              <kbd>R</kbd>
            </button>
            <button type="button" className="ck-btn ck-btn--go" onClick={onApprove} title="Approve the plan (unblocks a blocked unit)">
              <Icon name="approve" /> Approve
              <kbd>P</kbd>
            </button>
          </>
        )}
      </footer>
    </aside>
  );
}
