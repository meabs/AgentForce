import { useState } from 'react';
import type { Agent } from '../types';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import './CommandBar.css';

export type CommandId = 'summon' | 'assign' | 'hold' | 'retreat' | 'approve';

interface CommandBarProps {
  selected: Agent | undefined;
  onCommand: (cmd: CommandId) => void;
  onOpenCockpit: () => void;
  uplink: UplinkInfo;
  /** Externally "pressed" button (demo director) */
  pulse?: CommandId | null;
  /** Replaces the uplink status line (demo) */
  statusLabel?: string;
}

export function CommandBar({ selected, onCommand, onOpenCockpit, uplink, pulse, statusLabel }: CommandBarProps) {
  const [lastLocal, setLast] = useState<CommandId | null>(null);
  const last = pulse ?? lastLocal;
  const held = !!selected?.held;
  const real = !!selected?.cloudId;
  const holdLabel = real ? (held ? 'RESUME BOARD' : 'HOLD BOARD') : held ? 'RESUME' : 'HOLD';
  const tips: Partial<Record<CommandId, string>> = real
    ? {
        assign: 'sends a follow-up prompt to the cloud agent',
        hold: 'local only: pauses board updates, the cloud agent keeps running',
        retreat: 'stops the cloud agent (confirm first)',
        approve: 'sends follow-up "Approved, proceed."',
      }
    : {};

  const commands: Array<{ id: CommandId; label: string; icon: string; key: string; cls?: string }> = [
    { id: 'summon', label: 'SUMMON AGENT', icon: '＋', key: 'S' },
    { id: 'assign', label: 'ASSIGN MISSION', icon: '⌖', key: 'A' },
    { id: 'hold', label: holdLabel, icon: held ? '▶' : '❚❚', key: 'H', cls: held ? ' cmd-btn--on' : '' },
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
          {selected?.name ?? 'NO UNIT'}
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
            data-cmd={c.id}
            type="button"
            disabled={c.id !== 'summon' && !selected}
            className={`cmd-btn${last === c.id ? ' cmd-btn--fired' : ''}${c.cls ?? ''}`}
            onClick={() => {
              setLast(c.id);
              onCommand(c.id);
              window.setTimeout(() => setLast(null), 400);
            }}
            title={`${c.label} (${c.key})${c.id === 'summon' ? ' · launch a cloud agent or a drill unit' : ` → ${selected?.name ?? 'no unit'}`}${tips[c.id] ? ` · ${tips[c.id]}` : ''}`}
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
        <div
          className={`command-bar__secure command-bar__uplink--${uplink.phase}`}
          title={uplink.phase === 'online' ? 'Commands on real units go to the Cursor Cloud Agents API' : uplink.reason ?? ''}
        >
          {statusLabel
            ? statusLabel
            : uplink.phase === 'online'
            ? `⇅ CMD UPLINK ONLINE · API ${uplink.apiVersion ?? ''}`
            : uplink.phase === 'checking'
              ? '⇅ CMD UPLINK HANDSHAKE…'
              : uplink.phase === 'offline'
                ? '⇅ CMD UPLINK OFFLINE · SET CURSOR_API_KEY'
                : `⇅ CMD UPLINK ERROR`}
        </div>
      </div>
    </footer>
  );
}
