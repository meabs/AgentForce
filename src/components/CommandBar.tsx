import { useState } from 'react';
import type { Agent } from '../types';
import './CommandBar.css';

export type CommandId = 'summon' | 'assign' | 'hold' | 'retreat' | 'approve';

interface CommandBarProps {
  selected: Agent | undefined;
  onCommand: (cmd: CommandId) => void;
  onOpenCockpit: () => void;
}

export function CommandBar({ selected, onCommand, onOpenCockpit }: CommandBarProps) {
  const [last, setLast] = useState<CommandId | null>(null);
  const held = !!selected?.held;

  const commands: Array<{ id: CommandId; label: string; icon: string; key: string; cls?: string }> = [
    { id: 'summon', label: 'SUMMON AGENT', icon: '＋', key: 'S' },
    { id: 'assign', label: 'ASSIGN MISSION', icon: '⌖', key: 'A' },
    { id: 'hold', label: held ? 'RESUME' : 'HOLD', icon: held ? '▶' : '❚❚', key: 'H', cls: held ? ' cmd-btn--on' : '' },
    { id: 'retreat', label: 'RETREAT', icon: '↩', key: 'R' },
    { id: 'approve', label: 'APPROVE PLAN', icon: '✓', key: 'P', cls: ' cmd-btn--primary' },
  ];

  return (
    <footer className="command-bar">
      <div
        role="button"
        tabIndex={0}
        className="command-bar__unit command-bar__unit--clickable hud-panel"
        onClick={onOpenCockpit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            onOpenCockpit();
          }
        }}
        title="Open cockpit (Enter)"
      >
        <span className="command-bar__unit-tag">SELECTED</span>
        <strong>
          {selected?.name ?? '—'}
          {held && <em className="command-bar__hold">{selected?.retreated ? 'RTB' : 'HOLD'}</em>}
        </strong>
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
            onClick={(e) => e.stopPropagation()}
          >
            ◉ LIVE · {selected.live.rawState} · OPEN AGENT ↗
          </a>
        ) : (
          <span className="command-bar__unit-mission">⌖ {selected?.mission} · ENTER → COCKPIT</span>
        )}
      </div>

      <div className="command-bar__actions">
        {commands.map((c) => (
          <button
            key={c.id}
            type="button"
            disabled={c.id !== 'summon' && !selected}
            className={`cmd-btn${last === c.id ? ' cmd-btn--fired' : ''}${c.cls ?? ''}`}
            onClick={() => {
              setLast(c.id);
              onCommand(c.id);
              window.setTimeout(() => setLast(null), 400);
            }}
            title={`${c.label} (${c.key})${c.id === 'summon' ? '' : ` → ${selected?.name ?? 'no unit'}`}`}
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
          <kbd>ENTER</kbd> OPEN COCKPIT
        </div>
        <div>
          <kbd>SPACE</kbd> HOLD / RESUME
        </div>
        <div>
          <kbd>ESC</kbd> CLOSE COCKPIT
        </div>
        <div className="command-bar__secure">🔒 SECURE CHANNEL · AES-256</div>
      </div>
    </footer>
  );
}
