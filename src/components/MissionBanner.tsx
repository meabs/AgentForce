import type { ReactNode } from 'react';
import './MissionBanner.css';

interface MissionBannerProps {
  title?: string;
  leftMeta?: string;
  rightMeta?: string;
  /** Interactive controls rendered on the right of the top bar */
  right?: ReactNode;
  /** Interactive controls rendered on the left of the top bar (replaces leftMeta) */
  left?: ReactNode;
}

export function MissionBanner({
  title = 'MISSION ACTIVE',
  leftMeta = 'ORCHESTRATOR v2.7.1  ·  SYS-UPLINK: SECURE',
  rightMeta = 'SOL-9 / LUNAR OUTPOST  ·  CYCLE 4782.19',
  right,
  left,
}: MissionBannerProps) {
  return (
    <header className={`top-bar${left ? ' top-bar--controls' : ''}`}>
      <div className="top-bar__left">{left ?? leftMeta}</div>
      <div className="mission-banner">
        <span className="mission-banner__chevron" aria-hidden>
          ❮
        </span>
        <div className="mission-banner__core">
          <span className="mission-banner__pulse" aria-hidden />
          <h1>{title}</h1>
        </div>
        <span className="mission-banner__chevron" aria-hidden>
          ❯
        </span>
      </div>
      <div className="top-bar__right">{right ?? rightMeta}</div>
      <div className="top-bar__scan" aria-hidden />
    </header>
  );
}
