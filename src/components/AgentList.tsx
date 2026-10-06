import type { ReactNode } from 'react';
import type { Agent } from '../types';
import { ArchiveTray, type ArchivedUnit } from './ArchiveTray';
import { isReal, plainStatus, relTime, repoShort, updatedAt } from '../lib/agentView';
import { shipFor } from '../lib/art';
import { Icon } from './Icon';
import './AgentList.css';

interface AgentListProps {
  /** Units to show (already filtered by the caller) */
  agents: Agent[];
  /** Units on the board before filtering, for the header count */
  totalCount?: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  archived?: ArchivedUnit[];
  onRecall?: (id: string) => void;
  /** Ids that just finished and are about to fly to the archive */
  departing?: ReadonlySet<string>;
  /** Ids that just arrived (warp-in highlight) */
  arriving?: ReadonlySet<string>;
  /** Search / filter controls and connection state, rendered under the header */
  toolbar?: ReactNode;
  /** Shown when `agents` is empty */
  empty?: ReactNode;
  now?: number;
}

export function AgentList({ agents, totalCount, selectedId, onSelect, archived = [], onRecall, departing, arriving, toolbar, empty, now = Date.now() }: AgentListProps) {
  const total = totalCount ?? agents.length;
  return (
    <aside className="agent-list hud-panel" aria-label="Agent roster">
      <div className="hud-panel__header">
        <div>
          <span className="hud-panel__tag">AGENT ORCHESTRATOR</span>
          <span className="agent-list__sub">
            {agents.length === total ? `${total} active agent${total === 1 ? '' : 's'}` : `${agents.length} of ${total} shown`}
          </span>
        </div>
        <span className="hud-panel__meta">LIVE</span>
      </div>
      {toolbar && <div className="agent-list__toolbar">{toolbar}</div>}
      <ul className="agent-list__items">
        {agents.map((agent, i) => {
          const active = agent.id === selectedId;
          const st = plainStatus(agent);
          const real = isReal(agent);
          const upd = updatedAt(agent);
          return (
            <li
              key={agent.id}
              className={`${departing?.has(agent.id) ? 'is-departing' : ''}${arriving?.has(agent.id) ? ' is-arriving' : ''}`}
            >
              <button
                type="button"
                className={`agent-card agent-card--${agent.status.toLowerCase()}${agent.held ? ' agent-card--held' : ''}${active ? ' agent-card--selected' : ''}`}
                onClick={() => onSelect(agent.id)}
                aria-label={`${agent.name}, ${st.label}: ${agent.mission}. Open details`}
                aria-current={active ? 'true' : undefined}
              >
                <div className="agent-card__glyph" aria-hidden>
                  <img src={shipFor(agent.id)} alt="" className="agent-card__ship" width={40} height={26} />
                  {i < 9 && <kbd className="agent-card__key">{i + 1}</kbd>}
                </div>
                <div className="agent-card__body">
                  <div className="agent-card__top">
                    <span className="agent-card__name">
                      {agent.name}
                      {!real && <em className="tag tag--sim">SIM</em>}
                    </span>
                    <span className={`status-chip status-chip--${st.tone}`} title={st.hint}>
                      <Icon name={st.icon} /> {st.label}
                    </span>
                  </div>
                  <div className="agent-card__task">{agent.mission}</div>
                  <div className="agent-card__meta-row">
                    {real && agent.cloud?.repo ? (
                      <>
                        <span>
                          <Icon name="repo" /> {repoShort(agent.cloud.repo)}
                        </span>
                        {upd && <span>· {relTime(upd, now)}</span>}
                      </>
                    ) : (
                      <span>
                        {agent.classLabel} · {agent.role}
                      </span>
                    )}
                  </div>
                  <div className="agent-card__activity">{agent.activity}</div>
                  {!real && (
                    <div className="agent-card__bars" aria-hidden>
                      <div className="bar">
                        <span>HP</span>
                        <div className="bar__track">
                          <div className="bar__fill bar__fill--hp" style={{ width: `${agent.hp}%` }} />
                        </div>
                      </div>
                      <div className="bar">
                        <span>TOK</span>
                        <div className="bar__track">
                          <div className="bar__fill bar__fill--tok" style={{ width: `${agent.tokens}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </button>
            </li>
          );
        })}
        {agents.length === 0 && <li className="agent-list__empty">{empty ?? 'No agents match these filters.'}</li>}
      </ul>
      <ArchiveTray units={archived} selectedId={selectedId} onOpen={onSelect} onRecall={onRecall} />
    </aside>
  );
}
