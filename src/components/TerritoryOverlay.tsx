import { useEffect, useMemo, useState } from 'react';
import { agentColor, heat, HOME_KEY, type Territory, type Tile, type TouchMap } from '../lib/territory';
import { TerritoryGrid } from './TerritoryGrid';
import type { Agent } from '../types';
import './Territory.css';

interface Props {
  territories: Territory[];
  touches: TouchMap;
  agents: Agent[];
  now: number;
  onClose: () => void;
  /** Force a repo tab (demo director) */
  forceKey?: string;
  replay?: boolean;
}

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

export function TerritoryOverlay({ territories, touches, agents, now, onClose, forceKey, replay }: Props) {
  const [key, setKey] = useState(forceKey ?? HOME_KEY);
  const [hover, setHover] = useState<Tile | null>(null);
  useEffect(() => {
    if (forceKey) setKey(forceKey);
  }, [forceKey]);
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

  const terr = territories.find((t) => t.key === key) ?? territories[0];
  const repoTouches = touches[terr.key] ?? {};
  const stats = useMemo(() => {
    const charted = terr.files.length;
    const lit = terr.files.filter((f) => repoTouches[f]).length;
    const edits = terr.files.filter((f) => repoTouches[f]?.kind === 'edit').length;
    const by: Record<string, { name: string; color: string; count: number }> = {};
    for (const f of terr.files) {
      const t = repoTouches[f];
      if (!t) continue;
      (by[t.agentId] ??= { name: t.name, color: t.color, count: 0 }).count++;
    }
    const recent = terr.files
      .filter((f) => repoTouches[f])
      .map((f) => ({ path: f, ...repoTouches[f] }))
      .sort((a, b) => b.at - a.at)
      .slice(0, 9);
    const districts = terr.districts
      .map((d) => {
        const fs = terr.files.filter((f) => terr.byPath[f].dir === d.dir);
        return { ...d, pct: fs.length ? Math.round((fs.filter((f) => repoTouches[f]).length / fs.length) * 100) : 0 };
      })
      .sort((a, b) => b.pct - a.pct);
    return { charted, lit, edits, pct: charted ? Math.round((lit / charted) * 100) : 0, by: Object.entries(by).sort((a, b) => b[1].count - a[1].count), recent, districts };
  }, [terr, repoTouches]);

  const units =
    terr.key === HOME_KEY
      ? agents.filter((a) => !a.cloudId || a.id === 'cursor-7').map((a) => ({ id: a.id, x: a.x, y: a.y, color: agentColor(a.id), name: a.name }))
      : [];
  const ht = hover?.path ? repoTouches[hover.path] : undefined;

  return (
    <div className="terr-overlay" role="dialog" aria-label="Territory map">
      <div className="terr-overlay__frame hud-panel">
        <header className="terr-overlay__head">
          <div>
            <span className="hud-panel__tag">TERRITORY · FOG OF WAR</span>
            <h2>{terr.label}</h2>
          </div>
          <div className="terr-overlay__tabs">
            {territories.map((t) => (
              <button key={t.key} type="button" className={t.key === terr.key ? 'is-active' : ''} onClick={() => setKey(t.key)}>
                {t.key === HOME_KEY ? 'SECTOR 7G' : t.label}
                {!t.complete && <em> · CHARTED</em>}
              </button>
            ))}
          </div>
          <button type="button" className="terr-overlay__close" onClick={onClose} aria-label="Close territory (Esc)">
            ✕
          </button>
        </header>
        <div className="terr-overlay__body">
          <div className="terr-overlay__map">
            <TerritoryGrid territory={terr} touches={repoTouches} now={now} labels units={units} onHover={setHover} hovered={hover?.path ?? null} />
            <div className="terr-overlay__scan" aria-hidden />
          </div>
          <aside className="terr-overlay__side">
            <div className="terr-big">
              <strong>{stats.pct}%</strong>
              <span>EXPLORED</span>
            </div>
            <div className="terr-kv">
              <span>{terr.complete ? 'FILES IN REPO' : 'FILES CHARTED'}</span>
              <b>{stats.charted}</b>
            </div>
            <div className="terr-kv">
              <span>TILES LIT</span>
              <b className="text-cyan">{stats.lit}</b>
            </div>
            <div className="terr-kv">
              <span>EDITED</span>
              <b className="text-amber">{stats.edits}</b>
            </div>
            <div className="terr-note">
              {replay
                ? 'MISSION REPLAY · SCRIPTED UNITS'
                : terr.key === HOME_KEY
                  ? 'SIMULATED SECTOR · TILES LIGHT AS UNITS READ / EDIT FILES (TERMINAL INTEL + PATROLS)'
                  : terr.complete
                    ? 'REAL REPO TREE (PUBLIC GITHUB) · LIT TILES = FILES NAMED IN AGENT TRANSCRIPTS'
                    : 'CHARTED FROM AGENT TRANSCRIPTS + SUMMARIES (READ-ONLY UPLINK)'}
            </div>
            <div className="terr-section">UNITS IN THEATRE</div>
            <ul className="terr-legend">
              {stats.by.length === 0 && <li className="terr-empty">NO CONTACT YET</li>}
              {stats.by.map(([id, b]) => (
                <li key={id}>
                  <i style={{ background: b.color, boxShadow: `0 0 6px ${b.color}` }} />
                  <span>{b.name}</span>
                  <b>{b.count}</b>
                </li>
              ))}
            </ul>
            <div className="terr-section">DISTRICTS</div>
            <ul className="terr-districts">
              {stats.districts.slice(0, 7).map((d) => (
                <li key={d.dir}>
                  <span>{d.label}</span>
                  <div className="terr-districts__bar">
                    <div style={{ width: `${d.pct}%` }} />
                  </div>
                  <b>{d.pct}%</b>
                </li>
              ))}
            </ul>
            <div className="terr-section">{hover?.path ? 'TILE INTEL' : 'RECENT CONTACT'}</div>
            {hover?.path ? (
              <div className="terr-hover">
                <code>{hover.path}</code>
                {ht ? (
                  <span style={{ color: ht.color }}>
                    {ht.kind === 'edit' ? 'EDITED' : 'READ'} BY {ht.name} · {ago(now - ht.at)} AGO · {ht.count}× · HEAT {Math.round(heat(ht.at, now) * 100)}
                  </span>
                ) : (
                  <span className="terr-empty">UNEXPLORED · FOG</span>
                )}
              </div>
            ) : (
              <ul className="terr-recent">
                {stats.recent.map((r) => (
                  <li key={r.path}>
                    <i style={{ background: r.color }} />
                    <code>{r.path}</code>
                    <span>{ago(now - r.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}
