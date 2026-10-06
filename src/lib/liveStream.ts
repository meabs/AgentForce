/**
 * LIVE RUN STREAMING client: one EventSource per open cockpit on a running real unit.
 * Talks only to the local bridge (GET /api/agents/:id/stream, see plugins/agentStream.ts).
 * The static demo build never opens a stream (and tree-shakes this module out with App).
 */

export type LiveMode = 'stream' | 'poll';

export interface ToolEvent {
  callId: string;
  name: string;
  status: string;
  verb: string;
  label: string;
  paths: string[];
}

export type LiveEvent =
  | { type: 'hello'; mode: LiveMode; runId?: string; reason?: string; stale?: boolean }
  | { type: 'status'; status: string; runId?: string }
  | { type: 'assistant'; text: string; msg?: number }
  | { type: 'thinking'; text: string }
  | { type: 'tool'; tool: ToolEvent }
  | { type: 'user'; text: string; msg?: number }
  | { type: 'history'; messages: { type: string; text: string }[]; total: number }
  | { type: 'result'; status: string; text?: string; durationMs?: number; branch?: string; prUrl?: string }
  | { type: 'error'; code: string; message: string; fatal?: boolean }
  | { type: 'done' };

export interface ResumePoint {
  runId?: string;
  lastEventId?: string;
}

const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';
const EVENTS = ['hello', 'status', 'assistant', 'thinking', 'tool', 'user', 'history', 'result', 'error', 'done', 'ping'] as const;

export interface LiveHandle {
  close: () => void;
}

/**
 * Opens the bridge SSE stream. `onEvent` gets normalised events, `onBeat` fires on every frame
 * (including heartbeats) and `onFail` when the connection drops (the caller decides on retries;
 * the browser's built-in auto-reconnect is disabled by closing on error).
 */
export function openLiveStream(
  cloudId: string,
  resume: ResumePoint,
  cb: { onEvent: (e: LiveEvent, id: string) => void; onBeat: () => void; onFail: (httpLike: boolean) => void },
): LiveHandle | null {
  if (STATIC_DEMO || typeof EventSource === 'undefined') return null;
  const q = new URLSearchParams();
  if (resume.runId && resume.lastEventId) {
    q.set('runId', resume.runId);
    q.set('lastEventId', resume.lastEventId);
  }
  const forced = new URLSearchParams(window.location.search).get('stream');
  if (forced === 'poll') q.set('mode', 'poll');
  const qs = q.toString();
  const es = new EventSource(`/api/agents/${encodeURIComponent(cloudId)}/stream${qs ? `?${qs}` : ''}`);
  let opened = false;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    es.close();
  };
  es.onopen = () => {
    opened = true;
    cb.onBeat();
  };
  es.onerror = () => {
    if (closed) return;
    close();
    cb.onFail(!opened);
  };
  for (const name of EVENTS) {
    es.addEventListener(name, (raw) => {
      if (closed) return;
      const m = raw as MessageEvent<string>;
      cb.onBeat();
      if (name === 'ping') return;
      let d: any = {};
      try {
        d = m.data ? JSON.parse(m.data) : {};
      } catch {
        return;
      }
      const id = m.lastEventId ?? '';
      switch (name) {
        case 'hello':
          return cb.onEvent({ type: 'hello', mode: d.mode === 'poll' ? 'poll' : 'stream', runId: d.runId, reason: d.reason, stale: !!d.stale }, id);
        case 'status':
          return cb.onEvent({ type: 'status', status: String(d.status ?? ''), runId: d.runId }, id);
        case 'assistant':
          return cb.onEvent({ type: 'assistant', text: String(d.text ?? ''), msg: typeof d.msg === 'number' ? d.msg : undefined }, id);
        case 'thinking':
          return cb.onEvent({ type: 'thinking', text: String(d.text ?? '') }, id);
        case 'tool':
          return cb.onEvent(
            {
              type: 'tool',
              tool: {
                callId: String(d.callId ?? ''),
                name: String(d.name ?? 'tool'),
                status: String(d.status ?? ''),
                verb: String(d.verb ?? d.name ?? 'tool'),
                label: String(d.label ?? d.name ?? 'tool'),
                paths: Array.isArray(d.paths) ? d.paths.filter((p: unknown) => typeof p === 'string') : [],
              },
            },
            id,
          );
        case 'user':
          return cb.onEvent({ type: 'user', text: String(d.text ?? ''), msg: d.msg }, id);
        case 'history':
          return cb.onEvent({ type: 'history', messages: Array.isArray(d.messages) ? d.messages : [], total: Number(d.total) || 0 }, id);
        case 'result':
          return cb.onEvent({ type: 'result', status: String(d.status ?? ''), text: d.text, durationMs: d.durationMs, branch: d.branch, prUrl: d.prUrl }, id);
        case 'error':
          return cb.onEvent({ type: 'error', code: String(d.code ?? 'ERROR'), message: String(d.message ?? ''), fatal: !!d.fatal }, id);
        case 'done':
          close();
          return cb.onEvent({ type: 'done' }, id);
      }
    });
  }
  return { close };
}
