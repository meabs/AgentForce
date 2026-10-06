import type { RefObject } from 'react';
import { Icon } from './Icon';
import type { FleetFilter, SourceFilter, StatusFilter } from '../lib/agentView';

export interface FilterCounts {
  all: number;
  running: number;
  attention: number;
  done: number;
}

interface Props {
  filter: FleetFilter;
  onChange: (f: FleetFilter) => void;
  counts: FilterCounts;
  searchRef?: RefObject<HTMLInputElement | null>;
  /** Hide the real/simulated switch (e.g. the replay) */
  hideSource?: boolean;
  idPrefix: string;
  /** Narrow layout (roster column): shorter chip labels */
  compact?: boolean;
}

const STATUS_CHIPS: Array<[StatusFilter, string, string]> = [
  ['all', 'All', ''],
  ['running', 'Running', 'run'],
  ['attention', 'Needs attention', 'alert'],
  ['done', 'Finished', 'done'],
];

const SOURCES: Array<[SourceFilter, string, string]> = [
  ['all', 'All', 'Real cloud agents and simulated units'],
  ['real', 'Real', 'Only real Cursor cloud agents'],
  ['sim', 'Sim', 'Only simulated units'],
];

/** Search + status filter + real/simulated switch, shared by the roster and the list view. */
export function FilterBar({ filter, onChange, counts, searchRef, hideSource, idPrefix, compact }: Props) {
  return (
    <div className="filter-bar" role="search">
      <label className="filter-bar__search" htmlFor={`${idPrefix}-q`}>
        <Icon name="search" />
        <span className="sr-only">Search agents</span>
        <input
          id={`${idPrefix}-q`}
          ref={searchRef}
          type="search"
          value={filter.q}
          placeholder="Search name, task, repo, branch…"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => onChange({ ...filter, q: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              if (filter.q) onChange({ ...filter, q: '' });
              else (e.target as HTMLInputElement).blur();
            }
          }}
        />
        <kbd aria-hidden>/</kbd>
      </label>
      <div className="filter-bar__chips" role="group" aria-label="Filter by status">
        {STATUS_CHIPS.map(([k, full, tone]) => {
          const label = compact ? ({ all: 'All', running: 'Running', attention: 'Attention', done: 'Done' } as const)[k] : full;
          return (
          <button
            key={k}
            type="button"
            className={`chip${tone ? ` chip--${tone}` : ''}${filter.status === k ? ' is-active' : ''}`}
            aria-pressed={filter.status === k}
            aria-label={`${full}: ${counts[k]}`}
            onClick={() => onChange({ ...filter, status: k })}
          >
            {label} <b>{counts[k]}</b>
          </button>
          );
        })}
      </div>
      {!hideSource && (
        <div className="filter-bar__source" role="group" aria-label="Real or simulated agents">
          {SOURCES.map(([k, label, title]) => (
            <button
              key={k}
              type="button"
              title={title}
              className={`seg${filter.source === k ? ' is-active' : ''}`}
              aria-pressed={filter.source === k}
              onClick={() => onChange({ ...filter, source: k })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
