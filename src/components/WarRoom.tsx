import { useEffect, useMemo } from 'react';
import type { Lane } from '../hooks/useRunHistory';
import type { CloudAgent } from '../lib/uplink';
import { mapCursorState } from '../hooks/useCursorLive';
import './WarRoom.css';

interface Props {
  lanes: Record<string, Lane>;
  start: number;
  now: number;
  cloudRuns?: Array<CloudAgent & { callsign: string }>;
  onClose: () => void;
  onOpen?: (id: string) => void;
  replay?: boolean;
}

function dur(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}

const clock = (t: number) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function WarRoom({ lanes, start, now, cloudRuns = [], onClose, onOpen, replay }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const span = Math.max(60_000, now - start);
  const list = Object.values(lanes).filter((l) => !l.real || replay);
  const stats = useMemo(() => {
    let running = 0;
    let blocked = 0;
    let transitions = 0;
    for (const l of list) {
      for (const s of l.segs) {
        const d = (s.to ?? now) - s.from;
        if (s.s === 'RUNNING') running += d;
        if (s.s === 'BLOCKED') blocked += d;
      }
      transitions += l.segs.length - 1;
    }
    const total = running + blocked + 1;
    return { running, blocked, transitions, util: Math.round((running / Math.max(1, list.length * span)) * 100), health: Math.round((running / total) * 100) };
  }, [list, now, span]);

  const ticks = Array.from({ length: 7 }, (_, i) => start + (span * i) / 6);
  const runs = useMemo(
    () =>
      cloudRuns
        .map((r) => ({ ...r, c: Date.parse(r.createdAt ?? '') || 0, u: Date.parse(r.updatedAt ?? '') || 0 }))
        .filter((r) => r.c)
        .sort((a, b) => b.c - a.c)
        .slice(0, 10),
    [cloudRuns],
  );
  // Log-scaled age axis: the last hour gets as much room as the last month.
  const MAX_H = 24 * 45;
  const ageX = (t: number) => {
    const h = Math.max(0, (now - t) / 3600_000);
    return Math.max(0, 100 - (Math.log1p(Math.min(h, MAX_H)) / Math.log1p(MAX_H)) * 100);
  };
  const AGE_TICKS: Array<[string, number]> = [
    ['45D', MAX_H],
    ['7D', 168],
    ['1D', 24],
    ['6H', 6],
    ['1H', 1],
    ['NOW', 0],
  ];
  const finished = runs.filter((r) => mapCursorState(r.status) === 'IDLE').length;

  return (
    <div className={`war-room${replay ? ' war-room--replay' : ''}`} role="dialog" aria-label="War Room timeline">
      <div className="war-room__frame hud-panel">
        <header className="war-room__head">
          <div>
            <span className="hud-panel__tag">WAR ROOM · OPERATIONS TIMELINE</span>
            <h2>{replay ? 'OP-0417 · MISSION REPLAY' : 'SESSION AFTER-ACTION FEED'}</h2>
          </div>
          <div className="war-room__stats">
            <div>
              <b className="text-cyan">{list.length}</b>
              <span>UNITS</span>
            </div>
            <div>
              <b className="text-green">{dur(stats.running)}</b>
              <span>UNIT-TIME RUNNING</span>
            </div>
            <div>
              <b className="text-red">{dur(stats.blocked)}</b>
              <span>BLOCKED</span>
            </div>
            <div>
              <b className="text-amber">{stats.health}%</b>
              <span>FLOW HEALTH</span>
            </div>
            <div>
              <b>{stats.transitions}</b>
              <span>STATE CHANGES</span>
            </div>
          </div>
          <button type="button" className="war-room__close" onClick={onClose} aria-label="Close War Room (Esc)">
            ✕
          </button>
        </header>

        <section className="war-room__section">
          <div className="war-room__section-title">
            SESSION TIMELINE <span>{clock(start)} → {clock(now)} · {dur(now - start)}</span>
          </div>
          <div className="war-room__axis">
            {ticks.map((t, i) => (
              <span key={i} style={{ left: `${(i / 6) * 100}%` }}>
                {clock(t)}
              </span>
            ))}
          </div>
          <div className="war-room__lanes">
            {list.map((l) => (
              <div key={l.id} className="war-lane" onClick={() => onOpen?.(l.id)} role="button">
                <div className="war-lane__label">
                  <i style={{ background: l.color, boxShadow: `0 0 6px ${l.color}` }} />
                  <b>{l.name}</b>
                  <span>{l.mission}</span>
                </div>
                <div className="war-lane__track">
                  {l.segs.map((s, i) => {
                    const a = Math.max(start, s.from);
                    const b = s.to ?? now;
                    if (b <= start) return null;
                    return (
                      <div
                        key={i}
                        className={`war-seg war-seg--${s.s.toLowerCase()}${!s.to ? ' is-open' : ''}`}
                        style={{ left: `${((a - start) / span) * 100}%`, width: `${Math.max(0.4, ((b - a) / span) * 100)}%` }}
                        title={`${s.s} · ${clock(a)} · ${dur(b - a)}`}
                      />
                    );
                  })}
                  {l.segs.slice(1).map((s, i) => (
                    <span key={`m${i}`} className={`war-mark war-mark--${s.s.toLowerCase()}`} style={{ left: `${((s.from - start) / span) * 100}%` }} />
                  ))}
                </div>
              </div>
            ))}
            <div className="war-room__now" />
          </div>
          <div className="war-room__legend">
            <span className="war-seg--running">RUNNING</span>
            <span className="war-seg--idle">IDLE / DONE</span>
            <span className="war-seg--blocked">BLOCKED / ALERT</span>
          </div>
        </section>

        {!replay && (
          <section className="war-room__section">
            <div className="war-room__section-title">
              CLOUD RUN LOG <span>{runs.length ? `${runs.length} REAL RUNS · ${finished} FINISHED · LAUNCH AGE, LOG SCALE · READ-ONLY` : 'COMMAND UPLINK OFFLINE OR NO RUNS YET'}</span>
            </div>
            <div className="war-room__axis war-room__axis--runs">
              {AGE_TICKS.map(([label, h]) => (
                <span key={label} style={{ left: `${ageX(now - h * 3600_000)}%` }}>
                  {label}
                </span>
              ))}
            </div>
            <div className="war-room__runs">
              {runs.map((r) => {
                const st = mapCursorState(r.status);
                const left = ageX(r.c);
                const width = r.u > r.c ? Math.max(0.8, ageX(r.u) - left) : 0.8;
                return (
                  <div key={r.id} className="war-run" onClick={() => onOpen?.(r.id)} role="button">
                    <div className="war-lane__label">
                      <b>{r.callsign}</b>
                      <span title={r.name}>{r.name}</span>
                    </div>
                    <div className="war-lane__track">
                      <div className={`war-seg war-seg--${st.toLowerCase()}`} style={{ left: `${left}%`, width: `${width}%` }} />
                    </div>
                    <div className="war-run__meta">
                      <em className={`war-run__st war-run__st--${st.toLowerCase()}`}>{r.status}</em>
                      <span title={new Date(r.c).toLocaleString('en-GB')}>{r.u > r.c ? dur(r.u - r.c) : `${dur(now - r.c)} AGO`}</span>
                      {r.prUrl ? (
                        <a href={r.prUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                          PR↗
                        </a>
                      ) : (
                        <span className="war-run__nopr">·</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
