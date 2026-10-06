import { useState } from 'react';
import type { Agent } from '../types';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import { plainStatus } from '../lib/agentView';
import { Icon, type IconName } from './Icon';
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
  onHelp?: () => void;
}

/**
 * Orders for the selected unit. Each button leads with what it actually does in plain words;
 * the RTS name stays as the small caption so the theme survives.
 */
export function CommandBar({ selected, onCommand, onOpenCockpit, uplink, pulse, statusLabel, onHelp }: CommandBarProps) {
  const [lastLocal, setLast] = useState<CommandId | null>(null);
  const last = pulse ?? lastLocal;
  const held = !!selected?.held;
  const real = !!selected?.cloudId;
  const name = selected?.name ?? 'no agent selected';
  const st = selected ? plainStatus(selected) : undefined;

  const commands: Array<{ id: CommandId; label: string; rts: string; icon: IconName; key: string; tip: string; cls?: string }> = [
    { id: 'summon', label: 'Launch agent', rts: 'SUMMON', icon: 'launch', key: 'S', tip: 'Launch a new Cursor cloud agent (or a simulated drill unit)', cls: ' cmd-btn--primary' },
    {
      id: 'assign',
      label: real ? 'Follow-up' : 'Assign task',
      rts: 'ASSIGN',
      icon: 'followup',
      key: 'A',
      tip: real ? `Send a follow-up message to ${name}` : `Give ${name} a new (simulated) task`,
    },
    {
      id: 'hold',
      label: held ? (real ? 'Resume board' : 'Resume') : real ? 'Pause board' : 'Hold',
      rts: 'HOLD',
      icon: held ? 'running' : 'pause',
      key: 'H',
      tip: real ? 'Local only: pauses board updates for this agent. The cloud agent keeps running.' : 'Freeze or resume this simulated unit',
      cls: held ? ' cmd-btn--on' : '',
    },
    {
      id: 'retreat',
      label: real ? 'Stop agent' : 'Recall',
      rts: 'RETREAT',
      icon: 'stop',
      key: 'R',
      tip: real ? `Stop ${name}'s current run (asks for confirmation; the agent is not deleted)` : 'Send this simulated unit back to the rally point',
      cls: real ? ' cmd-btn--danger' : '',
    },
    {
      id: 'approve',
      label: 'Approve plan',
      rts: 'APPROVE',
      icon: 'approve',
      key: 'P',
      tip: real ? `Send "Approved, proceed." to ${name} (asks first)` : 'Approve the plan (unblocks a blocked simulated unit)',
    },
  ];

  return (
    <footer className="command-bar" aria-label="Commands">
      <button type="button" className="command-bar__unit command-bar__unit--clickable hud-panel" onClick={onOpenCockpit} disabled={!selected} title="Open details (Enter)">
        <span className="command-bar__unit-tag">SELECTED</span>
        <strong>
          {selected?.name ?? 'NO UNIT'}
          {held && <em className="command-bar__hold">{selected?.retreated ? 'RTB' : 'HOLD'}</em>}
        </strong>
        {st && (
          <span className={`status-chip status-chip--${st.tone} command-bar__status`}>
            <Icon name={st.icon} /> {st.label}
          </span>
        )}
        <span className="command-bar__unit-mission plain">{selected ? `${selected.mission}` : 'Pick an agent from the roster or the map'}</span>
        <span className="command-bar__unit-open">Details ▸</span>
      </button>

      <div className="command-bar__actions" role="toolbar" aria-label={`Orders for ${name}`}>
        {commands.map((c) => (
          <button
            key={c.id}
            data-cmd={c.id}
            type="button"
            disabled={c.id !== 'summon' && !selected}
            className={`cmd-btn${last === c.id ? ' cmd-btn--fired' : ''}${c.cls ?? ''}`}
            aria-label={`${c.label} (${c.key})${c.id === 'summon' ? '' : ` for ${name}`}`}
            aria-keyshortcuts={c.key}
            onClick={() => {
              setLast(c.id);
              onCommand(c.id);
              window.setTimeout(() => setLast(null), 400);
            }}
            title={`${c.tip} · key ${c.key}`}
          >
            <Icon name={c.icon} className="cmd-btn__icon" />
            <span className="cmd-btn__text">
              <span className="cmd-btn__label">{c.label}</span>
              <span className="cmd-btn__rts">{c.rts}</span>
            </span>
            <span className="cmd-btn__key" aria-hidden>
              {c.key}
            </span>
          </button>
        ))}
      </div>

      <div className="command-bar__keys hud-panel">
        <button type="button" className="command-bar__help" onClick={onHelp} disabled={!onHelp} aria-label="Keyboard shortcuts and glossary (?)">
          <Icon name="help" /> Shortcuts &amp; glossary <kbd>?</kbd>
        </button>
        <div className="command-bar__hint">
          <kbd>1-9</kbd> select · <kbd>/</kbd> search · <kbd>L</kbd> list
        </div>
        <div
          className={`command-bar__secure command-bar__uplink--${uplink.phase}`}
          title={uplink.phase === 'online' ? 'Commands on real agents go to the Cursor Cloud Agents API' : uplink.reason ?? ''}
        >
          {statusLabel
            ? statusLabel
            : uplink.phase === 'online'
              ? `● Connected to Cursor · API ${uplink.apiVersion ?? ''}`
              : uplink.phase === 'checking'
                ? '◌ Connecting to Cursor…'
                : uplink.phase === 'offline'
                  ? '○ Not connected · set CURSOR_API_KEY'
                  : uplink.rateLimitedUntil
                    ? '⚠ Rate limited · retrying'
                    : '⚠ Cursor connection error'}
        </div>
      </div>
    </footer>
  );
}
