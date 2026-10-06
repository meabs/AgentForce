import { useState } from 'react';
import type { Agent } from '../types';
import { agentColor, type Territory, type Touch } from '../lib/territory';
import { TerritoryGrid } from './TerritoryGrid';
import './Minimap.css';
import './Territory.css';

interface MinimapProps {
  agents: Agent[];
  selectedId: string | null;
  territory?: Territory;
  touches?: Record<string, Touch>;
  now?: number;
  onOpenTerritory?: () => void;
}

export function Minimap({ agents, selectedId, territory, touches, now = Date.now(), onOpenTerritory }: MinimapProps) {
  const [mode, setMode] = useState<'fog' | 'radar'>(() => (localStorage.getItem('afc.minimap') === 'radar' ? 'radar' : 'fog'));
  const pick = (m: 'fog' | 'radar') => {
    setMode(m);
    try {
      localStorage.setItem('afc.minimap', m);
    } catch {
      /* ignore */
    }
  };
  const showFog = mode === 'fog' && territory;
  const lit = territory ? territory.files.filter((f) => touches?.[f]).length : 0;
  const pct = territory ? Math.round((lit / Math.max(1, territory.files.length)) * 100) : 0;

  return (
    <div className="minimap hud-panel" aria-label="Sector minimap">
      <div className="hud-panel__header">
        <span className="hud-panel__tag">MINIMAP</span>
        {territory ? (
          <span className="minimap__modes">
            <button type="button" className={mode === 'fog' ? 'is-active' : ''} onClick={() => pick('fog')} title="Repo territory, fog of war">
              FOG
            </button>
            <button type="button" className={mode === 'radar' ? 'is-active' : ''} onClick={() => pick('radar')} title="Radar sweep">
              RADAR
            </button>
          </span>
        ) : (
          <span className="hud-panel__meta">SEC 7G</span>
        )}
      </div>
      {showFog ? (
        <div className="minimap__fog" onClick={onOpenTerritory} title="Open the territory map (T)" role="button">
          <TerritoryGrid
            territory={territory}
            touches={touches}
            now={now}
            units={agents.filter((a) => !a.cloudId || a.id === 'cursor-7').map((a) => ({ id: a.id, x: a.x, y: a.y, color: agentColor(a.id) }))}
          />
          <span className="minimap__fog-stat">{pct}% EXPLORED · T</span>
        </div>
      ) : (
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
      )}
    </div>
  );
}
