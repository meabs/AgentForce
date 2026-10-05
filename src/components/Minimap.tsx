import type { Agent } from '../types';
import './Minimap.css';

interface MinimapProps {
  agents: Agent[];
  selectedId: string | null;
}

export function Minimap({ agents, selectedId }: MinimapProps) {
  return (
    <div className="minimap hud-panel" aria-label="Sector minimap">
      <div className="hud-panel__header">
        <span className="hud-panel__tag">MINIMAP</span>
        <span className="hud-panel__meta">SEC 7G</span>
      </div>
      <div className="minimap__radar">
        <div className="minimap__rings" aria-hidden />
        <div className="minimap__sweep" aria-hidden />
        <div className="minimap__cross" aria-hidden />
        {agents.map((agent) => (
          <span
            key={agent.id}
            className={`minimap__blip minimap__blip--${agent.status.toLowerCase()}${agent.id === selectedId ? ' minimap__blip--selected' : ''}`}
            style={{ left: `${agent.x}%`, top: `${agent.y}%` }}
            title={agent.name}
          />
        ))}
        <span className="minimap__blip minimap__blip--neutral" style={{ left: '22%', top: '30%' }} />
        <span className="minimap__blip minimap__blip--neutral" style={{ left: '78%', top: '70%' }} />
      </div>
    </div>
  );
}
