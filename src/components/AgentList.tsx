import type { Agent, AgentStatus } from '../types';
import './AgentList.css';

interface AgentListProps {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  RUNNING: 'RUNNING',
  IDLE: 'IDLE',
  BLOCKED: 'BLOCKED',
};

export function AgentList({ agents, selectedId, onSelect }: AgentListProps) {
  const running = agents.filter((a) => a.status === 'RUNNING').length;
  const idle = agents.filter((a) => a.status === 'IDLE').length;
  return (
    <aside className="agent-list hud-panel" aria-label="Agent roster">
      <div className="hud-panel__header">
        <div>
          <span className="hud-panel__tag">AGENT ORCHESTRATOR</span>
          <div className="agent-list__tabs">
            <span>ALL ({agents.length})</span>
            <span className="is-active">WORKING ({running})</span>
            <span>IDLE ({idle})</span>
          </div>
        </div>
        <span className="hud-panel__meta">LIVE</span>
      </div>
      <ul className="agent-list__items">
        {agents.map((agent) => {
          const active = agent.id === selectedId;
          return (
            <li key={agent.id}>
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
      </ul>
    </aside>
  );
}
