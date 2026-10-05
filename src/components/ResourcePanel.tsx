import './SidePanels.css';

interface ResourcePanelProps {
  cpu: number;
  mem: number;
  net: number;
}

function Row({ label, value, tone }: { label: string; value: number; tone: 'cyan' | 'amber' }) {
  return (
    <div className="resource">
      <div className="resource__head">
        <span>{label}</span>
        <span className={tone === 'amber' ? 'text-amber' : 'text-cyan'}>{value}%</span>
      </div>
      <div className="resource__track">
        <div className={`resource__fill resource__fill--${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

export function ResourcePanel({ cpu, mem, net }: ResourcePanelProps) {
  return (
    <section className="hud-panel side-panel" aria-label="System resources">
      <div className="hud-panel__header">
        <span className="hud-panel__tag">SYSTEM RESOURCES</span>
        <span className="hud-panel__meta">NOMINAL</span>
      </div>
      <div className="side-panel__body">
        <Row label="CPU" value={cpu} tone="cyan" />
        <Row label="MEM" value={mem} tone="amber" />
        <Row label="NET" value={net} tone="cyan" />
        <div className="resource-stats">
          <div>
            <span>FLEET POWER</span>
            <strong className="text-cyan">72%</strong>
          </div>
          <div>
            <span>INTEL PTS</span>
            <strong className="text-amber">1,248</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
