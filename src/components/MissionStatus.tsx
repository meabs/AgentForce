import './SidePanels.css';

interface MissionStatusProps {
  progress: number;
  objective?: string;
  statusLabel?: string;
  opCode?: string;
  objectives?: Array<{ text: string; state: 'done' | 'active' | 'todo' }>;
}

const DEFAULT_OBJECTIVES: MissionStatusProps['objectives'] = [
  { text: 'Recon target repository', state: 'done' },
  { text: 'Harvest dependency intel', state: 'done' },
  { text: 'Resolve credential gate', state: 'active' },
  { text: 'Approve merge plan', state: 'todo' },
];

export function MissionStatus({
  progress,
  objective = 'ESTABLISH DATA BRIDGE',
  statusLabel = 'IN PROGRESS',
  opCode = 'OP-0417',
  objectives = DEFAULT_OBJECTIVES,
}: MissionStatusProps) {
  return (
    <section className="hud-panel side-panel" aria-label="Mission status">
      <div className="hud-panel__header">
        <span className="hud-panel__tag">MISSION STATUS</span>
        <span className="hud-panel__meta">{opCode}</span>
      </div>
      <div className="side-panel__body">
        <div className="kv">
          <span>OBJECTIVE</span>
          <strong>{objective}</strong>
        </div>
        <div className="kv">
          <span>STATUS</span>
          <strong className={progress >= 100 ? 'text-cyan' : 'text-amber'}>{statusLabel}</strong>
        </div>
        <div className="progress">
          <div className="progress__track">
            <div className="progress__fill" style={{ width: `${progress}%` }} />
            <div className="progress__ticks" />
          </div>
          <span className="progress__value">{progress}%</span>
        </div>
        <ul className="objectives">
          {objectives!.map((o) => (
            <li key={o.text} className={o.state === 'todo' ? '' : o.state}>
              {o.state === 'done' ? '◆' : '◇'} {o.text}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
