import { useEffect, useRef, useState } from 'react';
import type { Agent, AgentOverride, TermLine } from '../types';
import { MISSION_PICKS } from '../data/terminalScripts';
import { Terminal } from './Terminal';
import './Cockpit.css';

interface CockpitProps {
  agent: Agent;
  override: AgentOverride | undefined;
  lines: TermLine[];
  assignOpen: boolean;
  onAssignOpenChange: (open: boolean) => void;
  onClose: () => void;
  onHoldToggle: () => void;
  onAssign: (mission: string) => void;
  onRetreat: () => void;
  onApprove: () => void;
  onTerminalSubmit: (input: string) => void;
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
  assignOpen,
  onAssignOpenChange,
  onClose,
  onHoldToggle,
  onAssign,
  onRetreat,
  onApprove,
  onTerminalSubmit,
}: CockpitProps) {
  const held = !!override?.held;
  const [custom, setCustom] = useState('');
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (assignOpen) window.setTimeout(() => customRef.current?.focus(), 30);
  }, [assignOpen]);

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
          </div>
          <div className="cockpit__sub">
            {agent.classLabel} · {agent.role} · COCKPIT LINK ESTABLISHED
          </div>
        </div>
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

      <Terminal
        key={agent.id}
        agentName={agent.name}
        status={agent.status}
        held={held}
        lines={lines}
        onSubmit={onTerminalSubmit}
      />

      {assignOpen && (
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
        <button type="button" className={`ck-btn${held ? ' ck-btn--on' : ''}`} onClick={onHoldToggle}>
          {held ? '▶ RESUME' : '❚❚ HOLD'}
          <kbd>H</kbd>
        </button>
        <button type="button" className="ck-btn" onClick={() => onAssignOpenChange(!assignOpen)}>
          ⌖ ASSIGN<kbd>A</kbd>
        </button>
        <button type="button" className="ck-btn ck-btn--warn" onClick={onRetreat}>
          ↩ RETREAT<kbd>R</kbd>
        </button>
        <button type="button" className="ck-btn ck-btn--go" onClick={onApprove}>
          ✓ APPROVE<kbd>P</kbd>
        </button>
      </footer>
    </aside>
  );
}
