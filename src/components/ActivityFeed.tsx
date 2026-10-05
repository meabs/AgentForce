import type { ActivityEntry } from '../types';
import './ActivityFeed.css';

interface ActivityFeedProps {
  entries: ActivityEntry[];
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function ActivityFeed({ entries }: ActivityFeedProps) {
  return (
    <aside className="activity-feed hud-panel" aria-label="Activity feed">
      <div className="hud-panel__header">
        <span className="hud-panel__tag">ACTIVITY</span>
        <span className="hud-panel__meta">LIVE FEED</span>
      </div>
      <ul className="activity-feed__list">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={`activity-feed__item activity-feed__item--${entry.kind ?? 'info'}`}
          >
            <span className="activity-feed__prefix">&gt;&gt;</span>
            <span className="activity-feed__time">{formatTime(entry.timestamp)}</span>
            <span className="activity-feed__agent">{entry.agentName}</span>
            <span className="activity-feed__msg">{entry.message}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
