import './SidePanels.css';

interface MissionStatusProps {
  progress: number;
}

export function MissionStatus({ progress }: MissionStatusProps) {
  return (
    <section className="hud-panel side-panel" aria-label="Mission status">
      <div className="hud-panel__header">
        <span className="hud-panel__tag">MISSION STATUS</span>
        <span className="hud-panel__meta">OP-0417</span>
      </div>
      <div className="side-panel__body">
        <div className="kv">
          <span>OBJECTIVE</span>
          <strong>ESTABLISH DATA BRIDGE</strong>
        </div>
        <div className="kv">
          <span>STATUS</span>
          <strong className="text-amber">IN PROGRESS</strong>
        </div>
        <div className="progress">
          <div className="progress__track">
            <div className="progress__fill" style={{ width: `${progress}%` }} />
            <div className="progress__ticks" />
          </div>
          <span className="progress__value">{progress}%</span>
        </div>
        <ul className="objectives">
          <li className="done">◆ Recon target repository</li>
          <li className="done">◆ Harvest dependency intel</li>
          <li className="active">◇ Resolve credential gate</li>
          <li>◇ Approve merge plan</li>
        </ul>
      </div>
    </section>
  );
}
