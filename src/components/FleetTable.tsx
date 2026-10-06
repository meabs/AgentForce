import { useMemo, useState, type ReactNode, type RefObject } from 'react';
import type { Agent } from '../types';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import { absTime, branchUrl, isReal, plainStatus, relTime, repoShort, updatedAt, type FleetFilter } from '../lib/agentView';
import { shipFor } from '../lib/art';
import { FilterBar, type FilterCounts } from './FilterBar';
import { ConnectionNotice } from './ConnectionNotice';
import { Icon } from './Icon';
import './FleetTable.css';

type SortKey = 'name' | 'status' | 'repo' | 'branch' | 'updated' | 'pr';

interface Props {
  agents: Agent[];
  archivedIds: ReadonlySet<string>;
  selectedId: string | null;
  filter: FleetFilter;
  onFilterChange: (f: FleetFilter) => void;
  counts: FilterCounts;
  onOpen: (id: string) => void;
  onToggleArchive?: (id: string) => void;
  onArchiveFinished?: () => void;
  onLaunch?: () => void;
  onRefresh?: () => void;
  onHelp?: () => void;
  uplink: UplinkInfo;
  now: number;
  searchRef?: RefObject<HTMLInputElement | null>;
  demoLabel?: string;
  /** Rows that should never be archivable (e.g. the demo) */
  readOnly?: boolean;
}

const STATUS_RANK = { attention: 0, running: 1, done: 2 } as const;

const COLS: Array<[SortKey, string]> = [
  ['name', 'Agent'],
  ['status', 'Status'],
  ['repo', 'Repository'],
  ['branch', 'Branch'],
  ['updated', 'Updated'],
  ['pr', 'Links'],
];

/** The practical view: every agent in a sortable table, searchable and filterable. */
export function FleetTable({
  agents,
  archivedIds,
  selectedId,
  filter,
  onFilterChange,
  counts,
  onOpen,
  onToggleArchive,
  onArchiveFinished,
  onLaunch,
  onRefresh,
  onHelp,
  uplink,
  now,
  searchRef,
  demoLabel,
  readOnly,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'updated', dir: -1 });
  const [showArchived, setShowArchived] = useState(true);

  const rows = useMemo(() => {
    const list = agents.filter((a) => showArchived || !archivedIds.has(a.id));
    const val = (a: Agent): string | number => {
      switch (sort.key) {
        case 'name':
          return `${a.mission} ${a.name}`.toLowerCase();
        case 'status':
          return STATUS_RANK[plainStatus(a).group] * 10 + (archivedIds.has(a.id) ? 5 : 0);
        case 'repo':
          return repoShort(a.cloud?.repo) || '~';
        case 'branch':
          return a.cloud?.branch || '~';
        case 'updated':
          return updatedAt(a) ?? (isReal(a) ? 0 : now);
        case 'pr':
          return a.cloud?.prUrl ? 1 : 0;
      }
    };
    return [...list].sort((x, y) => {
      const a = val(x);
      const b = val(y);
      const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
      return c * sort.dir || x.name.localeCompare(y.name);
    });
  }, [agents, archivedIds, showArchived, sort, now]);

  const finishedActive = agents.filter((a) => !archivedIds.has(a.id) && isReal(a) && plainStatus(a).group === 'done').length;
  const realCount = agents.filter((a) => a.cloudId).length;
  const hiddenArchived = showArchived ? 0 : agents.filter((a) => archivedIds.has(a.id)).length;

  const header = (key: SortKey, label: string) => {
    const active = sort.key === key;
    return (
      <th key={key} scope="col" aria-sort={active ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={`ft__th ft__th--${key}`}>
        <button
          type="button"
          onClick={() => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'updated' || key === 'pr' ? -1 : 1 }))}
        >
          {label}
          <span className="ft__sort" aria-hidden>
            {active ? (sort.dir === 1 ? '▲' : '▼') : '↕'}
          </span>
        </button>
      </th>
    );
  };

  let empty: ReactNode = null;
  if (rows.length === 0)
    empty =
      agents.length === 0 ? (
        <>No agents on the board yet.</>
      ) : (
        <>
          No agents match these filters.{' '}
          <button type="button" className="link-btn" onClick={() => (onFilterChange({ q: '', status: 'all', source: 'all' }), setShowArchived(true))}>
            Clear filters
          </button>
        </>
      );

  return (
    <section className="fleet-table hud-panel" aria-label="Agent list">
      <div className="hud-panel__header fleet-table__header">
        <div>
          <span className="hud-panel__tag">
            <Icon name="list" /> FLEET ROSTER · LIST VIEW
          </span>
          <span className="fleet-table__sub">Click a row for details, conversation, follow-up and stop.</span>
        </div>
        <div className="fleet-table__tools">
          <label className="toggle">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
            Show archived
          </label>
          {onArchiveFinished && !readOnly && (
            <button
              type="button"
              className="tool-btn"
              disabled={finishedActive === 0}
              onClick={onArchiveFinished}
              title="Hide every finished real agent in the archive (board only, nothing is sent to Cursor)"
            >
              <Icon name="archive" /> Archive finished ({finishedActive})
            </button>
          )}
          {onLaunch && (
            <button type="button" className="tool-btn tool-btn--go" onClick={onLaunch} title="Launch a new cloud agent (S)">
              <Icon name="launch" /> Launch agent
            </button>
          )}
        </div>
      </div>
      <div className="fleet-table__bar">
        <FilterBar filter={filter} onChange={onFilterChange} counts={counts} searchRef={searchRef} idPrefix="ft" hideSource={!!demoLabel} />
        <ConnectionNotice uplink={uplink} realCount={realCount} now={now} onRefresh={onRefresh} onLaunch={onLaunch} onHelp={onHelp} verbose demoLabel={demoLabel} />
      </div>
      <div className="fleet-table__scroll">
        <table className="ft">
          <thead>
            <tr>{COLS.map(([k, l]) => header(k, l))}</tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const st = plainStatus(a);
              const archived = archivedIds.has(a.id);
              const upd = updatedAt(a);
              const bUrl = branchUrl(a.cloud?.repo, a.cloud?.branch);
              const url = a.cloud?.url ?? a.live?.url;
              return (
                <tr
                  key={a.id}
                  className={`ft__row ft__row--${st.tone}${a.id === selectedId ? ' is-selected' : ''}${archived ? ' is-archived' : ''}`}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a, button')) return;
                    onOpen(a.id);
                  }}
                >
                  <td className="ft__agent" data-label="Agent">
                    <img src={shipFor(a.id)} alt="" className="ft__ship" width={34} height={22} loading="lazy" />
                    <button type="button" className="ft__open" onClick={() => onOpen(a.id)} aria-label={`Open details for ${a.name}: ${a.mission}`}>
                      <span className="ft__task">{a.mission}</span>
                      <span className="ft__callsign">
                        {a.name}
                        {!isReal(a) && <em className="tag tag--sim">SIM</em>}
                        {archived && <em className="tag">ARCHIVED</em>}
                      </span>
                    </button>
                  </td>
                  <td data-label="Status" title={st.hint}>
                    <span className={`status-chip status-chip--${st.tone}`}>
                      <Icon name={st.icon} /> {st.label}
                    </span>
                  </td>
                  <td data-label="Repository" className={`ft__mono${a.cloud?.repo ? '' : ' ft__cell--empty'}`}>
                    {a.cloud?.repo ? (
                      <a href={a.cloud.repo} target="_blank" rel="noreferrer" title={a.cloud.repo}>
                        {repoShort(a.cloud.repo)}
                      </a>
                    ) : (
                      <span className="ft__dim">{isReal(a) ? '…' : 'simulated'}</span>
                    )}
                  </td>
                  <td data-label="Branch" className={`ft__mono ft__branch${a.cloud?.branch || a.cloud?.ref ? '' : ' ft__cell--empty'}`}>
                    {a.cloud?.branch ? (
                      bUrl ? (
                        <a href={bUrl} target="_blank" rel="noreferrer" title={a.cloud.branch}>
                          {a.cloud.branch}
                        </a>
                      ) : (
                        <span title={a.cloud.branch}>{a.cloud.branch}</span>
                      )
                    ) : (
                      <span className="ft__dim">{a.cloud?.ref ? `from ${a.cloud.ref}` : '—'}</span>
                    )}
                  </td>
                  <td data-label="Updated" title={absTime(upd)}>
                    {upd ? relTime(upd, now) : <span className="ft__dim">{isReal(a) ? '—' : 'live (sim)'}</span>}
                  </td>
                  <td data-label="Links" className="ft__links">
                    {a.cloud?.prUrl && (
                      <a href={a.cloud.prUrl} target="_blank" rel="noreferrer" className="ft__link" title={a.cloud.prUrl}>
                        <Icon name="pr" /> PR
                      </a>
                    )}
                    {url && (
                      <a href={url} target="_blank" rel="noreferrer" className="ft__link" title="Open in Cursor">
                        Cursor ↗
                      </a>
                    )}
                    {onToggleArchive && !readOnly && !a.pending && (
                      <button
                        type="button"
                        className="ft__link"
                        onClick={() => onToggleArchive(a.id)}
                        aria-label={archived ? `Restore ${a.name} to the roster` : `Archive ${a.name}`}
                        title={archived ? 'Restore to the active roster' : 'Hide in the archive (board only)'}
                      >
                        <Icon name={archived ? 'recall' : 'archive'} />
                        <span className="ft__link-text">{archived ? 'Restore' : 'Archive'}</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {empty && <div className="fleet-table__empty">{empty}</div>}
        {hiddenArchived > 0 && rows.length > 0 && (
          <div className="fleet-table__foot">
            {hiddenArchived} archived agent{hiddenArchived === 1 ? '' : 's'} hidden ·{' '}
            <button type="button" className="link-btn" onClick={() => setShowArchived(true)}>
              show
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
