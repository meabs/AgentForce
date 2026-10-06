import type { Agent } from '../types';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import './SidePanels.css';

const NOTICES = [
  { t: '14:31', msg: 'INTEL: Unknown convoy spotted near node lx-9' },
  { t: '14:28', msg: 'WARN: SCOUT-9 credential gate awaiting approval' },
  { t: '14:22', msg: 'SYS: Uplink relay re-keyed (AES-256)' },
  { t: '14:15', msg: 'OPS: Data bridge phase 2 authorised' },
  { t: '14:09', msg: 'INTEL: CODEX-3 harvest yield +18% vs. baseline' },
  { t: '14:02', msg: 'WARN: Token budget below 20% on SCOUT-9' },
  { t: '13:56', msg: 'SYS: Orbital relay drift corrected (0.4°)' },
  { t: '13:48', msg: 'OPS: CLAUDE-PRIME assumed fleet lead' },
];

interface NoticeBoardProps {
  liveAgent?: Agent;
  liveError?: string | null;
  uplink: UplinkInfo;
  realCount: number;
  /** Mission replay: scripted notices, no uplink boxes */
  replay?: { notices: Array<{ t: string; msg: string }>; clock: string };
}

function ago(iso: string) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (Number.isNaN(s)) return '--';
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
}

export function NoticeBoard({ liveAgent, liveError, uplink, realCount, replay }: NoticeBoardProps) {
  if (replay) {
    return (
      <section className="hud-panel side-panel side-panel--grow" aria-label="Notice board">
        <div className="hud-panel__header">
          <span className="hud-panel__tag">NOTICE BOARD</span>
          <span className="hud-panel__meta">{replay.notices.length} NEW</span>
        </div>
        <div className="live-link live-link--running">
          <div className="live-link__head">
            <span className="live-link__dot" />
            <span>MISSION REPLAY</span>
            <span className="live-link__state">T+{replay.clock}</span>
          </div>
          <div className="live-link__meta">SCRIPTED SEQUENCE · NO API KEY · NO REAL AGENTS TOUCHED</div>
        </div>
        <ul className="notices">
          {replay.notices.map((n) => (
            <li key={n.t + n.msg} className="notices__fresh">
              <span className="notices__time">{n.t}</span>
              <span>{n.msg}</span>
            </li>
          ))}
        </ul>
        <div className="authority">
          <span className="authority__sigil" aria-hidden />
          <div>
            FLEET COMMAND AUTHORITY
            <br />
            CLEARANCE: ECHO-7 · LINK: REPLAY
          </div>
        </div>
      </section>
    );
  }
  const cmdTone = uplink.phase === 'online' ? 'running' : uplink.phase === 'checking' ? 'idle' : 'off';
  return (
    <section className="hud-panel side-panel side-panel--grow" aria-label="Notice board">
      <div className="hud-panel__header">
        <span className="hud-panel__tag">NOTICE BOARD</span>
        <span className="hud-panel__meta">8 NEW</span>
      </div>
      {liveAgent?.live ? (
        <div className={`live-link live-link--${liveAgent.status.toLowerCase()}`}>
          <div className="live-link__head">
            <span className="live-link__dot" />
            <span>LIVE UPLINK · {liveAgent.name}</span>
            <span className="live-link__state">{liveAgent.live.rawState}</span>
          </div>
          <a className="live-link__url" href={liveAgent.live.url} target="_blank" rel="noreferrer">
            {liveAgent.live.url.replace(/^https?:\/\//, '')}
          </a>
          <div className="live-link__meta">
            {liveAgent.live.id.slice(0, 14)}… · UPDATED {ago(liveAgent.live.updatedAt)}
            {liveError ? ` · STALE (${liveError})` : ''}
          </div>
        </div>
      ) : (
        <div className="live-link live-link--off">
          <div className="live-link__head">
            <span className="live-link__dot" />
            <span>LIVE UPLINK OFFLINE</span>
          </div>
          <div className="live-link__meta">AWAITING /cursor-live.json{liveError ? ` · ${liveError}` : ''}</div>
        </div>
      )}
      <div className={`live-link live-link--${cmdTone} live-link--cmd`}>
        <div className="live-link__head">
          <span className="live-link__dot" />
          <span>COMMAND UPLINK</span>
          <span className="live-link__state">
            {uplink.phase === 'online' ? `ONLINE · ${uplink.apiVersion ?? ''}` : uplink.phase.toUpperCase()}
          </span>
        </div>
        <div className="live-link__meta">
          {uplink.phase === 'online'
            ? `${realCount} REAL UNIT${realCount === 1 ? '' : 'S'} ON BOARD · ORDERS DRIVE CLOUD AGENTS`
            : uplink.phase === 'checking'
              ? 'HANDSHAKE WITH /api/agents…'
              : `${uplink.reason ?? 'Uplink offline: set CURSOR_API_KEY'} · ORDERS STAY LOCAL`}
        </div>
      </div>
      <ul className="notices">
        {NOTICES.map((n) => (
          <li key={n.t + n.msg}>
            <span className="notices__time">{n.t}</span>
            <span>{n.msg}</span>
          </li>
        ))}
      </ul>
      <div className="authority">
        <span className="authority__sigil" aria-hidden />
        <div>
          FLEET COMMAND AUTHORITY
          <br />
          CLEARANCE: ECHO-7 · LINK: STABLE
        </div>
      </div>
    </section>
  );
}
