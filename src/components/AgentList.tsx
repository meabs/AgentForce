import { useState } from 'react';
import type { Agent, AgentStatus } from '../types';
import { ArchiveTray, type ArchivedUnit } from './ArchiveTray';
import './AgentList.css';

interface AgentListProps {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  archived?: ArchivedUnit[];
  onRecall?: (id: string) => void;
  /** Ids that just finished and are about to fly to the archive */
  departing?: ReadonlySet<string>;
  /** Ids that just arrived (warp-in highlight) */
  arriving?: ReadonlySet<string>;
}

type Filter = 'all' | 'working' | 'idle';

const STATUS_LABEL: Record<AgentStatus, string> = {
  RUNNING: 'RUNNING',
  IDLE: 'IDLE',
  BLOCKED: 'BLOCKED',
};

export function AgentList({ agents, selectedId, onSelect, archived = [], onRecall, departing, arriving }: AgentListProps) {
  const [filter, setFilter] = useState<Filter>('all');
  const running = agents.filter((a) => a.status === 'RUNNING').length;
  const idle = agents.filter((a) => a.status !== 'RUNNING').length;
  const shown = agents.filter((a) => filter === 'all' || (filter === 'working' ? a.status === 'RUNNING' : a.status !== 'RUNNING'));
  return (
    <aside className="agent-list hud-panel" aria-label="Agent roster">
      <div className="hud-panel__header">
        <div>
          <span className="hud-panel__tag">AGENT ORCHESTRATOR</span>
          <div className="agent-list__tabs">
            {(
              [
                ['all', `ALL (${agents.length})`],
                ['working', `WORKING (${running})`],
                ['idle', `IDLE/ALERT (${idle})`],
              ] as const
            ).map(([f, label]) => (
              <button key={f} type="button" className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <span className="hud-panel__meta">LIVE</span>
      </div>
      <ul className="agent-list__items">
        {shown.map((agent) => {
          const active = agent.id === selectedId;
          return (
            <li
              key={agent.id}
              className={`${departing?.has(agent.id) ? 'is-departing' : ''}${arriving?.has(agent.id) ? ' is-arriving' : ''}`}
            >
              <button
                type="button"
                className={`agent-card agent-card--${agent.status.toLowerCase()}${agent.held ? ' agent-card--held' : ''}${active ? ' agent-card--selected' : ''}`}
                onClick={() => onSelect(agent.id)}
              >
                <div className="agent-card__glyph" aria-hidden>
                  <span className="agent-card__glyph-inner" />
                </div>
                <div className="agent-card__body">
                  <div className="agent-card__top">
                    <span className="agent-card__name">{agent.name}</span>
                    <span className="agent-card__pills">
                      {agent.held && <span className="agent-hold">{agent.retreated ? 'RTB' : 'HOLD'}</span>}
                      <span className={`agent-status agent-status--${agent.status.toLowerCase()}`}>
                        {STATUS_LABEL[agent.status]}
                      </span>
                    </span>
                  </div>
                  <div className="agent-card__meta-row">
                    <span>{agent.classLabel}</span>
                    <span>·</span>
                    <span>{agent.role}</span>
                    <span>·</span>
                    <span className="agent-card__mission">{agent.mission}</span>
                  </div>
                  <div className="agent-card__activity">{agent.activity}</div>
                  <div className="agent-card__bars">
                    <div className="bar">
                      <span>HP</span>
                      <div className="bar__track">
                        <div className="bar__fill bar__fill--hp" style={{ width: `${agent.hp}%` }} />
                      </div>
                    </div>
                    <div className="bar">
                      <span>TOK</span>
                      <div className="bar__track">
                        <div
                          className="bar__fill bar__fill--tok"
                          style={{ width: `${agent.tokens}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="agent-list__empty">NO UNITS MATCH · {filter.toUpperCase()}</li>}
      </ul>
      <ArchiveTray units={archived} selectedId={selectedId} onOpen={onSelect} onRecall={onRecall} />
    </aside>
  );
}
