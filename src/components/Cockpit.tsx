import { useEffect, useRef, useState } from 'react';
import type { Agent, AgentOverride, TermLine } from '../types';
import { MISSION_PICKS } from '../data/terminalScripts';
import { Terminal } from './Terminal';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import './Cockpit.css';

interface CockpitProps {
  agent: Agent;
  override: AgentOverride | undefined;
  lines: TermLine[];
  uplink: UplinkInfo;
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

export function Cockpit({
  agent,
  override,
  lines,
  uplink,
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
}: CockpitProps) {
  const held = !!override?.held;
  const cloudId = agent.cloudId;
  const online = uplink.phase === 'online';
  const [custom, setCustom] = useState('');
  const [followup, setFollowup] = useState('');
  const customRef = useRef<HTMLInputElement>(null);
  const followRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (assignOpen) window.setTimeout(() => (cloudId ? followRef.current : customRef.current)?.focus(), 30);
  }, [assignOpen, cloudId]);

  const submitFollowup = () => {
    const t = followup.trim();
    if (!t || busy) return;
    onAssign(t);
    setFollowup('');
  };

  const submitCustom = () => {
    const m = custom.trim();
    if (!m) return;
    onAssign(m);
    setCustom('');
  };

  return (
    <aside
      className={`cockpit hud-panel cockpit--${agent.status.toLowerCase()}`}
      role="dialog"
      aria-label={`${agent.name} cockpit`}
      aria-modal="false"
    >
      <header className="cockpit__head">
        <div className="cockpit__glyph" aria-hidden>
          <span />
        </div>
        <div className="cockpit__ident">
          <div className="cockpit__name-row">
            <h2>{agent.name}</h2>
            <span className={`agent-status agent-status--${agent.status.toLowerCase()}`}>{agent.status}</span>
            {held && <span className="cockpit__badge cockpit__badge--hold">{override?.retreated ? 'RTB' : 'HOLD'}</span>}
            {agent.live && <span className="cockpit__badge cockpit__badge--live">◉ LIVE</span>}
            {cloudId && (
              <span className={`cockpit__badge cockpit__badge--${online ? 'cmd' : 'cmdoff'}`} title="Command uplink to the real cloud agent">
                {online ? '⇅ CMD LINK' : '⇅ CMD OFFLINE'}
              </span>
            )}
          </div>
          <div className="cockpit__sub">
            {agent.classLabel} · {agent.role} · COCKPIT LINK ESTABLISHED
          </div>
        </div>
        {onArchive && (
          <button
            type="button"
            className="cockpit__archive"
            onClick={onArchive}
            title={archived ? 'Recall to the active roster (board only)' : 'Park in the archive tray (board only, nothing is sent to the agent)'}
          >
            {archived ? '⇡ RECALL' : '⇣ ARCHIVE'}
          </button>
        )}
        <button type="button" className="cockpit__close" onClick={onClose} aria-label="Close cockpit (Esc)" title="Close (Esc)">
          ✕
        </button>
      </header>

      <section className="cockpit__stats">
        <div className="cockpit__mission">
          <span>MISSION</span>
          <strong>{agent.mission}</strong>
        </div>
        <div className="cockpit__activity">
          <span>ACTIVITY</span>
          <em>{agent.activity}</em>
        </div>
        <Bar label="PROG" value={agent.progress} tone="prog" />
        <Bar label="HP" value={agent.hp} tone="hp" />
        <Bar label="TOK" value={agent.tokens} tone="tok" />
      </section>

      {agent.live && (
        <section className="cockpit__uplink">
          <div>
            <span className="cockpit__uplink-tag">UPLINK</span> state <b>{agent.live.rawState}</b> · updated{' '}
            {new Date(agent.live.updatedAt).toLocaleTimeString('en-GB')}
          </div>
          <a href={agent.live.url} target="_blank" rel="noreferrer" className="cockpit__open">
            OPEN AGENT ↗
          </a>
        </section>
      )}

      {cloudId && (
        <section className={`cockpit__cmdlink cockpit__cmdlink--${online ? 'on' : uplink.phase === 'checking' ? 'wait' : 'off'}`}>
          <div className="cockpit__cmdlink-row">
            <span className="cockpit__uplink-tag">CMD UPLINK</span>
            {online ? (
              <>
                {cloudId.slice(0, 15)}… · state <b>{agent.cloud?.rawStatus ?? agent.live?.rawState ?? '?'}</b>
                {agent.cloud?.repo && (
                  <span className="cockpit__cmdlink-repo">
                    {' '}
                    · {agent.cloud.repo.replace(/^https?:\/\/(www\.)?github\.com\//, '')}
                    {agent.cloud.ref ? `@${agent.cloud.ref}` : ''}
                  </span>
                )}
              </>
            ) : uplink.phase === 'checking' ? (
              <>handshake…</>
            ) : (
              <>
                <b>{uplink.phase === 'error' ? 'ERROR' : 'OFFLINE'}</b> ·{' '}
                {uplink.phase === 'error'
                  ? `${uplink.reason ?? 'bridge error'} · orders still try the uplink`
                  : 'set CURSOR_API_KEY · orders fall back to the local board'}
              </>
            )}
            {busy && <span className="cockpit__cmdlink-busy"> · TRANSMITTING…</span>}
          </div>
          {!agent.live && (agent.cloud?.prUrl || agent.cloud?.url) && (
            <a href={agent.cloud?.prUrl ?? agent.cloud?.url} target="_blank" rel="noreferrer" className="cockpit__open">
              {agent.cloud?.prUrl ? 'OPEN PR ↗' : 'OPEN AGENT ↗'}
            </a>
          )}
        </section>
      )}

      <Terminal
        key={agent.id}
        agentName={agent.name}
        status={agent.status}
        held={held}
        lines={lines}
        onSubmit={onTerminalSubmit}
      />

      {assignOpen && cloudId && (
        <div className="cockpit__picker cockpit__picker--followup" role="dialog" aria-label="Send follow-up">
          <div className="cockpit__picker-head">
            <span>ASSIGN MISSION → {agent.name} · FOLLOW-UP</span>
            <button type="button" onClick={() => onAssignOpenChange(false)} aria-label="Cancel">
              ✕
            </button>
          </div>
          <textarea
            ref={followRef}
            className="cockpit__followup"
            rows={3}
            value={followup}
            placeholder={`New orders for ${agent.name}… (sent as a follow-up prompt to ${cloudId.slice(0, 12)}…)`}
            onChange={(e) => setFollowup(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submitFollowup();
              }
              if (e.key === 'Escape') onAssignOpenChange(false);
            }}
          />
          <div className="cockpit__followup-foot">
            <span>
              {online
                ? 'ENTER sends · SHIFT+ENTER newline · goes to the real cloud agent'
                : 'uplink offline: this will only relabel the unit on the board'}
            </span>
            <button type="button" onClick={submitFollowup} disabled={!followup.trim() || busy}>
              {busy ? 'SENDING…' : online ? '⇪ SEND FOLLOW-UP' : 'ASSIGN (LOCAL)'}
            </button>
          </div>
        </div>
      )}

      {assignOpen && !cloudId && (
        <div className="cockpit__picker" role="listbox" aria-label="Assign mission">
          <div className="cockpit__picker-head">
            <span>ASSIGN MISSION → {agent.name}</span>
            <button type="button" onClick={() => onAssignOpenChange(false)} aria-label="Cancel">
              ✕
            </button>
          </div>
          <div className="cockpit__picks">
            {MISSION_PICKS.map((m) => (
              <button
                type="button"
                key={m}
                className={m === agent.mission ? 'is-current' : ''}
                onClick={() => onAssign(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <div className="cockpit__custom">
            <input
              ref={customRef}
              value={custom}
              placeholder="Custom mission…"
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
        <button
          type="button"
          className={`ck-btn${held ? ' ck-btn--on' : ''}`}
          onClick={onHoldToggle}
          title={cloudId ? 'Local only: pauses board updates for this unit. The cloud agent keeps running.' : 'Freeze / resume this unit'}
        >
          {held ? (cloudId ? '▶ RESUME BOARD' : '▶ RESUME') : cloudId ? '❚❚ HOLD BOARD' : '❚❚ HOLD'}
          <kbd>H</kbd>
        </button>
        <button type="button" className="ck-btn" onClick={() => onAssignOpenChange(!assignOpen)}>
          ⌖ ASSIGN<kbd>A</kbd>
        </button>
        <button
          type="button"
          className="ck-btn ck-btn--warn"
          onClick={onRetreat}
          disabled={busy}
          title={cloudId ? 'Stop the cloud agent (asks for confirmation)' : 'Fall back to the rally point'}
        >
          {cloudId ? '■ RETREAT' : '↩ RETREAT'}
          <kbd>R</kbd>
        </button>
        <button
          type="button"
          className="ck-btn ck-btn--go"
          onClick={onApprove}
          disabled={busy}
          title={cloudId ? 'Sends the follow-up "Approved, proceed."' : 'Approve the plan'}
        >
          ✓ APPROVE<kbd>P</kbd>
        </button>
      </footer>
    </aside>
  );
}
