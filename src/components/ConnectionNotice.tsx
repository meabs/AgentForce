import type { UplinkInfo } from '../hooks/useCloudAgents';
import { artUrl } from '../lib/art';
import { Icon } from './Icon';

interface Props {
  uplink: UplinkInfo;
  realCount: number;
  now: number;
  onRefresh?: () => void;
  onLaunch?: () => void;
  onHelp?: () => void;
  /** Always show a one-line status, even when everything is fine (list view) */
  verbose?: boolean;
  /** Replay / static demo: no bridge at all */
  demoLabel?: string;
}

/** Loading, empty and error states for the Cursor connection, in plain words. */
export function ConnectionNotice({ uplink, realCount, now, onRefresh, onLaunch, onHelp, verbose, demoLabel }: Props) {
  if (demoLabel)
    return (
      <div className="conn conn--demo" role="status">
        <Icon name="running" /> {demoLabel}
      </div>
    );
  const checked = uplink.checkedAt ? Math.max(0, Math.round((now - uplink.checkedAt) / 1000)) : null;
  if (uplink.phase === 'checking')
    return (
      <div className="conn conn--wait" role="status">
        <span className="conn__spinner" aria-hidden /> Connecting to Cursor…
      </div>
    );
  if (uplink.phase === 'offline')
    return (
      <div className="conn conn--off" role="status">
        <img src={artUrl('kenney/station-display.png')} alt="" className="conn__art" width={46} height={41} />
        <div>
          <b>Not connected to Cursor.</b> Showing simulated agents only. Add <code>CURSOR_API_KEY</code> to <code>.env.local</code> and the
          board connects within seconds (no restart).
          {onHelp && (
            <button type="button" className="link-btn" onClick={onHelp}>
              What is simulated?
            </button>
          )}
        </div>
      </div>
    );
  if (uplink.phase === 'error') {
    const limited = !!uplink.rateLimitedUntil && uplink.rateLimitedUntil > now;
    return (
      <div className="conn conn--err" role="alert">
        <Icon name="alert" />
        <div>
          <b>{limited ? 'Rate limited by Cursor.' : 'Cursor connection error.'}</b> {uplink.reason ?? 'The bridge did not answer.'}
          {limited && <> Retrying in {Math.max(1, Math.round((uplink.rateLimitedUntil! - now) / 1000))} s.</>}
          {!limited && onRefresh && (
            <button type="button" className="link-btn" onClick={onRefresh}>
              Retry now
            </button>
          )}
        </div>
      </div>
    );
  }
  if (realCount === 0)
    return (
      <div className="conn conn--empty" role="status">
        <img src={artUrl('kenney/station-console.png')} alt="" className="conn__art" width={39} height={39} />
        <div>
          <b>Connected, no cloud agents yet.</b>
          {onLaunch && (
            <button type="button" className="link-btn" onClick={onLaunch}>
              Launch your first agent
            </button>
          )}
        </div>
      </div>
    );
  if (!verbose) return null;
  return (
    <div className="conn conn--on" role="status">
      <span className="conn__dot" aria-hidden /> Connected to Cursor API {uplink.apiVersion} · {realCount} real agent{realCount === 1 ? '' : 's'}
      {checked !== null && <> · checked {checked < 5 ? 'just now' : `${checked}s ago`}</>}
      {onRefresh && (
        <button type="button" className="link-btn" onClick={onRefresh} aria-label="Refresh agent list now">
          <Icon name="refresh" /> Refresh
        </button>
      )}
    </div>
  );
}
