/**
 * Plain-language view of a unit: what a human needs to manage it (status words, repo, branch,
 * timestamps, links), independent of the RTS dressing.
 */
import type { Agent } from '../types';
import type { IconName } from '../components/Icon';

export type StatusGroup = 'running' | 'attention' | 'done';
export type StatusTone = 'run' | 'alert' | 'done' | 'hold' | 'idle';

export interface PlainStatus {
  label: string;
  group: StatusGroup;
  tone: StatusTone;
  icon: IconName;
  /** One sentence for tooltips / the detail panel */
  hint: string;
}

const FAILED_RE = /^(FAILED|ERROR|ERRORED|TIMEOUT)$/;
const NEEDS_RE = /^(BLOCKED|NEEDS_INPUT|AWAITING_APPROVAL)$/;
const STARTING_RE = /^(CREATING|PENDING|QUEUED|STARTING)$/;
const EXPIRED_RE = /^EXPIRED$/;
const STOPPED_RE = /^(CANCELLED|CANCELED|STOPPED)$/;
const FINISHED_RE = /^(FINISHED|COMPLETED|COMPLETE|DONE|SUCCEEDED|SUCCESS)$/;

export function plainStatus(a: Agent): PlainStatus {
  const raw = (a.cloud?.rawStatus ?? a.live?.rawState ?? '').toUpperCase();
  if (a.pending)
    return a.status === 'BLOCKED'
      ? { label: 'Launch failed', group: 'attention', tone: 'alert', icon: 'alert', hint: a.activity }
      : { label: 'Launching', group: 'running', tone: 'run', icon: 'pending', hint: 'Waiting for Cursor to return the new agent id' };
  if (a.held)
    return {
      label: a.retreated ? 'Recalled (board)' : 'Paused (board)',
      group: a.status === 'RUNNING' ? 'running' : a.status === 'BLOCKED' ? 'attention' : 'done',
      tone: 'hold',
      icon: 'pause',
      hint: a.cloudId
        ? 'Board updates are paused locally. The cloud agent itself keeps running.'
        : 'Simulated unit frozen by you. Resume to continue.',
    };
  if (raw) {
    if (FAILED_RE.test(raw))
      return { label: 'Failed', group: 'attention', tone: 'alert', icon: 'alert', hint: `Cursor reports ${raw}. Read the conversation, then send a follow-up or open it in Cursor.` };
    if (NEEDS_RE.test(raw))
      return { label: 'Needs input', group: 'attention', tone: 'alert', icon: 'alert', hint: `Cursor reports ${raw}: the agent is waiting for you.` };
    if (STARTING_RE.test(raw)) return { label: 'Starting', group: 'running', tone: 'run', icon: 'pending', hint: `Cursor reports ${raw}.` };
    if (EXPIRED_RE.test(raw))
      return { label: 'Expired', group: 'done', tone: 'done', icon: 'success', hint: 'Finished a while ago; Cursor has retired its workspace.' };
    if (STOPPED_RE.test(raw)) return { label: 'Stopped', group: 'done', tone: 'done', icon: 'stop', hint: `Cursor reports ${raw}.` };
    if (FINISHED_RE.test(raw)) return { label: 'Finished', group: 'done', tone: 'done', icon: 'success', hint: 'The agent completed its run. Send a follow-up to give it more work.' };
  }
  if (a.status === 'RUNNING') return { label: 'Running', group: 'running', tone: 'run', icon: 'running', hint: raw ? `Cursor reports ${raw}.` : 'Working.' };
  if (a.status === 'BLOCKED')
    return { label: 'Needs attention', group: 'attention', tone: 'alert', icon: 'alert', hint: 'Blocked: waiting for a decision (APPROVE PLAN unblocks simulated units).' };
  return { label: a.cloudId ? 'Idle' : 'Idle', group: 'done', tone: 'idle', icon: 'success', hint: raw ? `Cursor reports ${raw}.` : 'Waiting for orders.' };
}

export const GROUP_LABEL: Record<StatusGroup, string> = { running: 'Running', attention: 'Needs attention', done: 'Finished / idle' };

export function repoShort(url?: string) {
  if (!url) return '';
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/^github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '');
}

export function isGithub(url?: string) {
  return !!url && /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/.test(url);
}

/** Link to a branch on GitHub (only for github.com repos). */
export function branchUrl(repo?: string, branch?: string) {
  if (!repo || !branch || !isGithub(repo)) return undefined;
  return `${repo.replace(/\.git$/, '').replace(/\/+$/, '')}/tree/${branch.split('/').map(encodeURIComponent).join('/')}`;
}

export function updatedAt(a: Agent): number | undefined {
  const t = Date.parse(a.cloud?.updatedAt ?? a.live?.updatedAt ?? a.cloud?.createdAt ?? '');
  return Number.isFinite(t) ? t : undefined;
}

export function relTime(ts: number | undefined, now = Date.now()) {
  if (!ts) return '';
  const s = Math.round((now - ts) / 1000);
  if (s < 0) return 'just now';
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  if (d < 45) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function absTime(ts?: number) {
  if (!ts) return '';
  return new Date(ts).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------- filters

export type StatusFilter = 'all' | StatusGroup;
export type SourceFilter = 'all' | 'real' | 'sim';

export interface FleetFilter {
  q: string;
  status: StatusFilter;
  source: SourceFilter;
}

export const EMPTY_FILTER: FleetFilter = { q: '', status: 'all', source: 'all' };

export const isReal = (a: Agent) => !!a.cloudId || !!a.pending;

export function matches(a: Agent, f: FleetFilter) {
  if (f.source === 'real' && !isReal(a)) return false;
  if (f.source === 'sim' && isReal(a)) return false;
  if (f.status !== 'all' && plainStatus(a).group !== f.status) return false;
  const q = f.q.trim().toLowerCase();
  if (!q) return true;
  const hay = [a.name, a.mission, a.activity, a.cloudId, a.cloud?.repo, a.cloud?.branch, a.cloud?.rawStatus, plainStatus(a).label, a.classLabel, a.role]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}

export const filterActive = (f: FleetFilter) => f.q.trim() !== '' || f.status !== 'all' || f.source !== 'all';

/** Status-chip counts for a list under the current search/source filter. */
export function countsOf(list: Agent[], f: FleetFilter): { all: number; running: number; attention: number; done: number } {
  const base = list.filter((a) => matches(a, { ...f, status: 'all' }));
  const c = { all: base.length, running: 0, attention: 0, done: 0 };
  for (const a of base) c[plainStatus(a).group]++;
  return c;
}
