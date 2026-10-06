import { useEffect, useRef, useState } from 'react';
import type { Agent } from '../types';
import './SidePanels.css';
import './BurnMeter.css';

/** Blended estimate used for the frugal meter (clearly labelled EST in the UI). */
export const USD_PER_MTOK = 6;
const BUDGET_USD = 2;
const SAMPLES = 48;

export function rateOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 33 + id.charCodeAt(i)) >>> 0;
  return 25 + (h % 50); // tokens / second while RUNNING (illustrative)
}

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${Math.round(n)}`);

interface Props {
  agents: Agent[];
  /** Estimated tokens seen in real cloud transcripts (chars / 4) */
  cloudTokens?: number;
  /** Speeds the meter up for the demo replay */
  speed?: number;
  resetKey?: number;
}

export function BurnMeter({ agents, cloudTokens = 0, speed = 1, resetKey = 0 }: Props) {
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const [session, setSession] = useState(0);
  const [hist, setHist] = useState<number[]>(() => new Array(SAMPLES).fill(0));
  const [units, setUnits] = useState(0);

  useEffect(() => {
    setSession(0);
    setHist(new Array(SAMPLES).fill(0));
    const t = window.setInterval(() => {
      let perSec = 0;
      let running = 0;
      for (const a of agentsRef.current) {
        if (a.held) continue;
        if (a.status === 'RUNNING') {
          perSec += rateOf(a.id);
          running++;
        } else if (a.status === 'BLOCKED') perSec += 4;
      }
      perSec *= speed;
      setSession((s) => s + perSec);
      setHist((h) => [...h.slice(1), perSec * 60]);
      setUnits(running);
    }, 1000);
    return () => window.clearInterval(t);
  }, [speed, resetKey]);

  const perMin = hist[hist.length - 1];
  const max = Math.max(1, ...hist);
  const usd = (session / 1e6) * USD_PER_MTOK;
  const hourly = ((perMin * 60) / 1e6) * USD_PER_MTOK;
  // Graded per running unit, so a bigger fleet is not automatically "less frugal".
  const perUnit = units ? hourly / units : 0;
  const grade = perUnit < 0.75 ? 'A+' : perUnit < 1.5 ? 'A' : perUnit < 3 ? 'B' : perUnit < 6 ? 'C' : 'D';
  const pts = hist.map((v, i) => `${(i / (SAMPLES - 1)) * 100},${30 - (v / max) * 27}`).join(' ');

  return (
    <section className="hud-panel side-panel" aria-label="Resource meter">
      <div className="hud-panel__header">
        <span className="hud-panel__tag">RESOURCE METER</span>
        <span className="hud-panel__meta" title={`Frugal rating: projected spend per running unit per hour (${USD_PER_MTOK} USD per 1M tokens, blended estimate). Token rates are illustrative.`}>
          FRUGAL {grade}
        </span>
      </div>
      <div className="side-panel__body burn">
        <div className="burn__rate">
          <strong>{fmt(perMin)}</strong>
          <span>TOK / MIN</span>
          <em>≈ ${hourly.toFixed(2)}/HR</em>
        </div>
        <svg className="burn__spark" viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden>
          <polygon points={`0,30 ${pts} 100,30`} className="burn__area" />
          <polyline points={pts} className="burn__line" />
        </svg>
        <div className="burn__row">
          <span>SESSION</span>
          <b className="text-cyan">{fmt(session)} TOK</b>
          <b className="text-amber">${usd.toFixed(2)}</b>
        </div>
        <div className="resource__track burn__budget" title={`Session estimate vs a ${BUDGET_USD} USD frugal budget`}>
          <div className={`resource__fill resource__fill--${usd > BUDGET_USD * 0.8 ? 'amber' : 'cyan'}`} style={{ width: `${Math.min(100, (usd / BUDGET_USD) * 100)}%` }} />
        </div>
        <div className="burn__foot">
          <span>BUDGET ${BUDGET_USD.toFixed(2)} · EST @ ${USD_PER_MTOK}/1M TOK</span>
          {cloudTokens > 0 && <span className="text-cyan">CLOUD INTEL {fmt(cloudTokens)} TOK</span>}
        </div>
      </div>
    </section>
  );
}
