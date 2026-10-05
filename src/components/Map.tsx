import type { Agent } from '../types';
import './Map.css';

interface MapProps {
  agents: Agent[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** Project flat map coords (0-100) onto the isometric ground plane (screen %). */
const ANGLE = (-32 * Math.PI) / 180;
const TILT = 0.58;
export function project(x: number, y: number) {
  const dx = x - 50;
  const dy = y - 50;
  const rx = dx * Math.cos(ANGLE) - dy * Math.sin(ANGLE);
  const ry = dx * Math.sin(ANGLE) + dy * Math.cos(ANGLE);
  return { left: 50 + rx * 1.05, top: 54 + ry * TILT * 1.25 };
}

const STRUCTURES = [
  { x: 48, y: 48, kind: 'core', label: 'cursor-subagent-api' },
  { x: 70, y: 26, kind: 'std', label: 'relay-node-lx7' },
  { x: 36, y: 60, kind: 'amber', label: 'harvest-depot' },
  { x: 74, y: 62, kind: 'std', label: '' },
  { x: 26, y: 34, kind: 'std', label: '' },
];

const LINKS: Array<[number, number]> = [
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [0, 3],
];

export function Map({ agents, selectedId, onSelect }: MapProps) {
  return (
    <div className="tactical-map" aria-label="Tactical operations map">
      <div className="tactical-map__bg" />
      <div className="tactical-map__perspective">
        <div className="tactical-map__plane">
          <div className="tactical-map__terrain" />
          <div className="tactical-map__grid" aria-hidden />
        </div>
      </div>

      <div className="tactical-map__overlay">
        <svg className="tactical-map__links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {LINKS.map(([a, b]) => {
            const p = project(STRUCTURES[a].x, STRUCTURES[a].y);
            const q = project(STRUCTURES[b].x, STRUCTURES[b].y);
            return <line key={`${a}-${b}`} x1={p.left} y1={p.top} x2={q.left} y2={q.top} />;
          })}
          {agents.map((ag) => {
            const p = project(ag.x, ag.y);
            const q = project(STRUCTURES[0].x, STRUCTURES[0].y);
            return (
              <line
                key={`l-${ag.id}`}
                className={`agent-link agent-link--${ag.status.toLowerCase()}`}
                x1={p.left}
                y1={p.top}
                x2={q.left}
                y2={q.top}
              />
            );
          })}
        </svg>

        {STRUCTURES.map((s, i) => {
          const p = project(s.x, s.y);
          return (
            <div
              key={i}
              className={`structure structure--${s.kind}`}
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
              aria-hidden
            >
              <span className="structure__block" />
              <span className="structure__light" />
              {s.kind === 'core' && <span className="structure__reticle" />}
              {s.label && <span className="structure__label">{s.label}</span>}
            </div>
          );
        })}

        {agents.map((agent) => {
          const selected = agent.id === selectedId;
          const p = project(agent.x, agent.y);
          return (
            <button
              key={agent.id}
              type="button"
              className={`unit-marker unit-marker--${agent.status.toLowerCase()}${agent.held ? ' unit-marker--held' : ''}${selected ? ' unit-marker--selected' : ''}`}
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
              onClick={() => onSelect(agent.id)}
              aria-label={`${agent.name}, ${agent.status}`}
            >
              <span className="unit-marker__ring" />
              <span className="unit-marker__beacon" />
              <span className="unit-marker__ship" />
              <span className="unit-label">
                <span className="unit-label__name">{agent.name}</span>
                <span className="unit-label__status">
                  {agent.status}{agent.held ? (agent.retreated ? ' · RTB' : ' · HOLD') : ''} · {agent.progress}%
                </span>
                <span className="unit-label__activity">{agent.activity}</span>
              </span>
            </button>
          );
        })}

        <div className="tactical-map__crosshair" aria-hidden />
      </div>

      <div className="tactical-map__scanlines" aria-hidden />
      <div className="tactical-map__hud-tl">
        SECTOR: 7G // ORION BELT
        <br />
        SCALE: 1 GRID = 50KM
      </div>
      <div className="tactical-map__hud-br">
        <span className="legend legend--ally">ALLY</span>
        <span className="legend legend--neutral">NEUTRAL</span>
        <span className="legend legend--threat">THREAT</span>
      </div>
      <div className="tactical-map__tools" aria-hidden>
        <button type="button">＋</button>
        <button type="button">－</button>
        <button type="button">▣</button>
        <button type="button">◎</button>
      </div>
      <div className="tactical-map__vignette" aria-hidden />
    </div>
  );
}
