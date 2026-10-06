import { useEffect, useRef, useState } from 'react';
import { openLiveStream, type LiveEvent, type LiveHandle, type ResumePoint } from '../lib/liveStream';

export type LinkState = 'connecting' | 'live' | 'polling' | 'ended' | 'error';

const WATCHDOG_MS = 40_000; // bridge pings every 15 s
const RETRY_MS = [1500, 3000, 6000, 12000];
const REOPEN_AFTER_DONE_MS = 4000;
/** When the unit stops running while the cockpit stays open, keep listening this long for the tail + `done`. */
const DRAIN_MS = 10_000;

interface Session {
  id: string;
  draining: boolean;
  dispose: (reason: string) => void;
  drain: () => void;
}

/**
 * Keeps one live stream open for `cloudId` while `active` (cockpit open + unit running).
 * - Cockpit closes: the stream closes at once (the bridge aborts upstream).
 * - Unit stops running (status poll or stream result): the stream drains until `done` (max 10 s)
 *   so the final text and result are not cut off, then closes. No reconnects while draining.
 * - Drops: retries with backoff, resuming v1 run streams from the last event id.
 * `onClosed` fires once per opened session (cockpit closed, run finished, or drain timeout).
 */
export function useLiveStream(
  cloudId: string | null,
  active: boolean,
  onEvent: (cloudId: string, e: LiveEvent) => void,
  onClosed: (cloudId: string, reason: string) => void,
) {
  const [link, setLink] = useState<{ id: string; state: LinkState; reason?: string } | null>(null);
  const cbRef = useRef({ onEvent, onClosed });
  cbRef.current = { onEvent, onClosed };
  const cloudRef = useRef(cloudId);
  cloudRef.current = cloudId;
  const activeRef = useRef(active);
  activeRef.current = active;
  /** Per agent resume point survives cockpit close / reopen. */
  const resumeRef = useRef<Record<string, ResumePoint>>({});
  const drainingRef = useRef<Session | null>(null);

  // Cockpit switched or closed: kill any draining session for the old unit.
  useEffect(() => {
    return () => drainingRef.current?.dispose('cockpit closed');
  }, [cloudId]);

  useEffect(() => {
    if (!cloudId || !active) return;
    drainingRef.current?.dispose('superseded');
    let disposed = false;
    let draining = false;
    let everOpened = false;
    let handle: LiveHandle | null = null;
    let watchdog: number | undefined;
    let retryTimer: number | undefined;
    let drainTimer: number | undefined;
    let attempt = 0;
    const id = cloudId;

    const dispose = (reason: string) => {
      if (disposed) return;
      disposed = true;
      window.clearTimeout(watchdog);
      window.clearTimeout(retryTimer);
      window.clearTimeout(drainTimer);
      handle?.close();
      handle = null;
      if (drainingRef.current === session) drainingRef.current = null;
      setLink((l) => (l?.id === id ? { ...l, state: 'ended', reason } : l));
      if (everOpened) cbRef.current.onClosed(id, reason);
    };
    const beat = () => {
      window.clearTimeout(watchdog);
      watchdog = window.setTimeout(() => {
        handle?.close();
        retry('heartbeat lost');
      }, WATCHDOG_MS);
    };
    const retry = (reason: string, delay?: number, state?: LinkState) => {
      if (disposed) return;
      if (draining) return dispose(reason);
      window.clearTimeout(watchdog);
      const ms = delay ?? RETRY_MS[Math.min(attempt, RETRY_MS.length - 1)];
      attempt++;
      setLink({ id, state: state ?? (delay !== undefined ? 'ended' : 'error'), reason });
      retryTimer = window.setTimeout(open, ms);
    };
    const open = () => {
      if (disposed) return;
      setLink((l) => (l?.id === id && (l.state === 'live' || l.state === 'polling') ? l : { id, state: 'connecting' }));
      handle = openLiveStream(id, resumeRef.current[id] ?? {}, {
        onBeat: beat,
        onFail: (beforeOpen) => retry(beforeOpen ? 'bridge refused the stream' : 'connection dropped'),
        onEvent: (e, evId) => {
          if (disposed) return;
          if (e.type === 'hello' && e.stale) {
            // v1 still points at the previous finished run (status lag after a follow-up): no replay,
            // `done` follows and we look again shortly.
            setLink({ id, state: 'connecting', reason: 'waiting for the new run' });
            return;
          }
          if (e.type === 'hello') {
            attempt = 0;
            everOpened = true;
            const prev = resumeRef.current[id];
            if (e.mode === 'stream') resumeRef.current[id] = { runId: e.runId, lastEventId: prev?.runId === e.runId ? prev.lastEventId : undefined };
            setLink({ id, state: e.mode === 'stream' ? 'live' : 'polling', reason: e.reason });
          } else if (evId) {
            const r = resumeRef.current[id];
            if (r?.runId) r.lastEventId = evId;
          }
          if (e.type !== 'done' || everOpened) cbRef.current.onEvent(id, e);
          if (e.type === 'done') {
            handle = null;
            if (draining || !activeRef.current) return dispose('run stream complete');
            // Status poll still says running (e.g. a follow-up started a new run): look again shortly.
            if (everOpened) retry('run stream complete', REOPEN_AFTER_DONE_MS);
            else retry('waiting for the new run', 2000, 'connecting');
          }
        },
      });
      if (!handle) {
        disposed = true;
        setLink(null);
        return;
      }
      beat();
    };
    const session: Session = {
      id,
      get draining() {
        return draining;
      },
      dispose,
      drain: () => {
        if (disposed) return;
        if (!handle) return dispose('unit stopped');
        draining = true;
        drainingRef.current = session;
        drainTimer = window.setTimeout(() => dispose('drain timeout'), DRAIN_MS);
      },
    };
    open();
    return () => {
      // Same unit, still in the cockpit, just not running any more: let the stream finish.
      if (cloudRef.current === id && !activeRef.current) session.drain();
      else dispose('cockpit closed');
    };
  }, [cloudId, active]);

  return link && link.id === cloudId ? link : null;
}
