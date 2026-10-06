import { useEffect, useState } from 'react';
import type { AgentStatus } from '../types';

/** Shape of public/cursor-live.json (written by scripts/write-cursor-status.mjs). */
export interface CursorLive {
  id: string;
  name: string;
  title: string;
  state: string;
  url: string;
  updatedAt: string;
  summary: string;
}

const POLL_MS = 2000;

/** Map raw cloud-agent states onto board statuses. Unknown states → IDLE. */
export function mapCursorState(state: string | undefined): AgentStatus {
  const s = (state ?? '').trim().toUpperCase();
  if (['CREATING', 'PENDING', 'QUEUED', 'STARTING', 'RUNNING', 'IN_PROGRESS', 'ACTIVE', 'WORKING'].includes(s))
    return 'RUNNING';
  if (['FAILED', 'ERROR', 'ERRORED', 'BLOCKED', 'CANCELLED', 'CANCELED', 'EXPIRED', 'TIMEOUT', 'NEEDS_INPUT', 'AWAITING_APPROVAL'].includes(s))
    return 'BLOCKED';
  // FINISHED, COMPLETED, DONE, SUCCEEDED, STOPPED, IDLE, …
  return 'IDLE';
}

function isLive(v: unknown): v is CursorLive {
  return !!v && typeof v === 'object' && typeof (v as CursorLive).state === 'string';
}

/**
 * Polls /cursor-live.json (static file served by Vite from /public).
 * No API calls, no secrets: the file is updated from outside the browser.
 * Returns null until a valid file is read; keeps the last good value on errors.
 */
export function useCursorLive(path = '/cursor-live.json') {
  const [live, setLive] = useState<CursorLive | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(`${path}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: unknown = await res.json();
        if (!isLive(data)) throw new Error('invalid shape');
        if (!cancelled) {
          setError(null);
          setLive((prev) =>
            prev && prev.updatedAt === data.updatedAt && prev.state === data.state && prev.summary === data.summary
              ? prev
              : data,
          );
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    };
    load();
    const t = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [path]);

  return { live, error };
}
