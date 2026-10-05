import { useState } from 'react';
import type { Agent } from '../types';
import './CommandBar.css';

interface CommandBarProps {
  selected: Agent | undefined;
  onCommand: (cmd: string) => void;
}

const COMMANDS = [
  { id: 'summon', label: 'SUMMON AGENT', icon: '＋', key: 'S' },
  { id: 'assign', label: 'ASSIGN MISSION', icon: '⌖', key: 'A' },
  { id: 'hold', label: 'HOLD', icon: '❚❚', key: 'H' },
  { id: 'retreat', label: 'RETREAT', icon: '↩', key: 'R' },
  { id: 'approve', label: 'APPROVE PLAN', icon: '✓', key: 'P' },
];

export function CommandBar({ selected, onCommand }: CommandBarProps) {
  const [last, setLast] = useState<string | null>(null);

  return (
    <footer className="command-bar">
      <div className="command-bar__unit hud-panel">
        <span className="command-bar__unit-tag">SELECTED</span>
        <strong>{selected?.name ?? '—'}</strong>
        <div className="command-bar__hp">
          <span>HP</span>
          <div className="command-bar__hp-track">
            <div className="command-bar__hp-fill" style={{ width: `${selected?.hp ?? 0}%` }} />
          </div>
          <span>{selected?.hp ?? 0}</span>
        </div>
        {selected?.live ? (
          <a
            className="command-bar__unit-link"
            href={selected.live.url}
            target="_blank"
            rel="noreferrer"
            title={selected.live.url}
          >
            ◉ LIVE · {selected.live.rawState} · OPEN AGENT ↗
          </a>
        ) : (
          <span className="command-bar__unit-mission">{selected?.mission}</span>
        )}
      </div>

      <div className="command-bar__actions">
        {COMMANDS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`cmd-btn${last === c.id ? ' cmd-btn--fired' : ''}${c.id === 'approve' ? ' cmd-btn--primary' : ''}`}
            onClick={() => {
              setLast(c.id);
              onCommand(c.label);
              window.setTimeout(() => setLast(null), 400);
            }}
          >
            <span className="cmd-btn__icon">{c.icon}</span>
            <span className="cmd-btn__label">{c.label}</span>
            <span className="cmd-btn__key">{c.key}</span>
          </button>
        ))}
      </div>

      <div className="command-bar__keys hud-panel">
        <div>
          <kbd>1-9</kbd> SELECT UNIT
        </div>
        <div>
          <kbd>SPACE</kbd> HOLD POSITION
        </div>
        <div>
          <kbd>TAB</kbd> CYCLE MISSION
        </div>
        <div className="command-bar__secure">🔒 SECURE CHANNEL · AES-256</div>
      </div>
    </footer>
  );
}
