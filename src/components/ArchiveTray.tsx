import { useState } from 'react';
import './ArchiveTray.css';

export interface ArchivedUnit {
  id: string;
  name: string;
  mission: string;
  rawStatus: string;
  finishedAt?: number;
  prUrl?: string;
  url?: string;
  repo?: string;
  summary?: string;
  real: boolean;
}

interface Props {
  units: ArchivedUnit[];
  selectedId: string | null;
  onOpen: (id: string) => void;
  onRecall?: (id: string) => void;
  defaultOpen?: boolean;
}

function ago(ts?: number) {
  if (!ts) return '';
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Finished units park here so the roster only shows the fleet that is actually in play. */
export function ArchiveTray({ units, selectedId, onOpen, onRecall, defaultOpen }: Props) {
  const [open, setOpen] = useState(!!defaultOpen);
  const done = units.filter((u) => /FINISH|COMPLETE|DONE|SUCCE/.test(u.rawStatus)).length;
  return (
    <div className={`archive-tray${open ? ' is-open' : ''}${units.length ? '' : ' is-empty'}`}>
      <button type="button" className="archive-tray__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="archive-tray__chev">{open ? '▾' : '▸'}</span>
        <span className="archive-tray__title">ARCHIVE TRAY</span>
        <span className="archive-tray__count">
          {units.length} PARKED{done ? ` · ${done} ✓` : ''}
        </span>
      </button>
      {open && (
        <ul className="archive-tray__list">
          {units.length === 0 && <li className="archive-tray__empty">FINISHED UNITS DOCK HERE</li>}
          {units.map((u) => {
            const ok = /FINISH|COMPLETE|DONE|SUCCE/.test(u.rawStatus);
            return (
              <li key={u.id} className={u.id === selectedId ? 'is-selected' : ''}>
                <button type="button" className="archive-card" onClick={() => onOpen(u.id)} title={u.summary || u.mission}>
                  <span className={`archive-card__dot archive-card__dot--${ok ? 'ok' : 'off'}`} />
                  <span className="archive-card__name">{u.name}</span>
                  <span className="archive-card__mission">{u.mission}</span>
                  <span className={`archive-card__status archive-card__status--${ok ? 'ok' : 'off'}`}>{u.rawStatus}</span>
                  <span className="archive-card__age">{ago(u.finishedAt)}</span>
                </button>
                <span className="archive-card__actions">
                  {u.prUrl && (
                    <a href={u.prUrl} target="_blank" rel="noreferrer" title="Open pull request">
                      PR↗
                    </a>
                  )}
                  {onRecall && (
                    <button type="button" onClick={() => onRecall(u.id)} title="Recall to the active roster (board only)">
                      RECALL
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
