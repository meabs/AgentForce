import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * LIVE RUN STREAMING: one SSE route per agent, two upstream strategies, one wire format.
 *
 *   Browser EventSource ──GET /api/agents/:id/stream──▶ bridge ──▶ Cursor API
 *
 * Mode "stream" (preferred): GET /v1/agents/{id} for latestRunId, then proxy
 *   GET /v1/agents/{id}/runs/{runId}/stream (SSE). Works for agents launched through v0 too
 *   (verified live 2026-10-06: v1 serves v0-created bc- ids).
 * Mode "poll" (fallback): 1 s polling of the transcript (v0 /conversation), emitting only new
 *   content, plus status every ~3 s. Used when v1 has no run for the agent, the stream is
 *   expired (410) / refused, or the stream keeps dropping.
 *
 * Wire format to the browser (event: data JSON), identical in both modes:
 *   hello     { mode, agentId, runId?, reason?, stale? } first event (stale: latest run long finished, no replay)
 *   status    { status, runId? }
 *   assistant { text, msg? }                            text delta (poll mode adds the transcript index)
 *   thinking  { text }                                  thinking delta
 *   tool      { callId, name, status, verb, label, paths[] }   summarised, never raw args/results
 *   user      { text, msg }                             (poll mode only: new user prompt)
 *   history   { messages: [{type,text}] }               (poll mode only: recent context once)
 *   result    { status, text?, durationMs?, branch?, prUrl? }
 *   error     { code, message, fatal? }
 *   ping      { t }                                     heartbeat every 15 s
 *   done      { }                                       stream complete: client must close
 * Forwarded upstream SSE ids are kept so the client can resume with ?lastEventId=&runId=.
 */

export interface StreamDeps {
  base: string;
  /** Pre-built Authorization header value. Never logged, never sent to the browser. */
  auth: string;
  /** v0 or v1 transcript, normalised (bridge api.conversation). */
  conversation: (id: string) => Promise<{ id: string; type: 'user' | 'assistant' | 'status'; text: string }[]>;
  /** Normalised status (bridge api.get). */
  status: (id: string) => Promise<{ status: string; summary?: string; branch?: string; prUrl?: string }>;
}

export interface StreamOpts {
  forceMode?: 'poll' | 'stream';
  lastEventId?: string;
  lastRunId?: string;
}

const HEARTBEAT_MS = 15_000;
const UPSTREAM_IDLE_MS = 60_000; // upstream sends its own heartbeats; silence this long = dead
const POLL_MS = 1000;
const STATUS_EVERY = 3; // poll ticks
const MAX_RECONNECTS = 3;
const MAX_STREAMS = 8;
const MAX_TEXT = 8000;
const HISTORY_MAX = 6;
/** A terminal run older than this is "stale" (already seen); newer ones are still replayed. */
const STALE_RUN_MS = 30_000;
const TERMINAL = /^(FINISHED|COMPLETED|DONE|SUCCEEDED|ERROR|FAILED|CANCELLED|CANCELED|EXPIRED|STOPPED|ARCHIVED)$/;

let openStreams = 0;
export const streamStats = { opened: 0, closed: 0, upstreamAborts: 0, get open() { return openStreams; } };

// ---------------------------------------------------------------- helpers

function clip(s: unknown, n = MAX_TEXT): string {
  const t = typeof s === 'string' ? s : '';
  return t.length > n ? t.slice(0, n) : t;
}

/** Strip sandbox prefixes so paths match repo-relative trees (mirrors src/lib/territory normalisePath). */
export function normPath(p: string): string {
  let s = p.trim().replace(/^\.\//, '');
  s = s.replace(/^\/?(?:workspace|home\/[\w.-]+(?:\/[\w.-]+)?|repo|app)\//, '');
  return s.replace(/^\/+/, '');
}

const PATH_KEYS = ['path', 'target_file', 'targetFile', 'file_path', 'filePath', 'relative_workspace_path', 'file', 'filename'];
const VERB: Record<string, string> = {
  edit_file: 'edit', search_replace: 'edit', write: 'edit', write_file: 'edit', apply_patch: 'edit', edit: 'edit',
  multi_edit: 'edit', MultiEdit: 'edit', create_file: 'edit', edit_notebook: 'edit',
  delete_file: 'delete',
  read_file: 'read', read: 'read', view_file: 'read',
  run_terminal_cmd: 'run', shell: 'run', bash: 'run', run_command: 'run',
  grep: 'grep', grep_search: 'grep', codebase_search: 'search', semantic_search: 'search', file_search: 'find',
  glob_file_search: 'find', list_dir: 'ls', ls: 'ls', web_search: 'web', fetch: 'web', todo_write: 'plan', mcp: 'mcp',
};

function pickPaths(args: any): string[] {
  if (!args || typeof args !== 'object') return [];
  const out = new Set<string>();
  for (const k of PATH_KEYS) if (typeof args[k] === 'string' && args[k].length < 300) out.add(normPath(args[k]));
  if (Array.isArray(args.paths)) for (const p of args.paths.slice(0, 20)) if (typeof p === 'string') out.add(normPath(p));
  if (Array.isArray(args.files)) for (const f of args.files.slice(0, 20)) if (typeof f?.path === 'string') out.add(normPath(f.path));
  return [...out].filter((p) => p && !p.endsWith('/'));
}

export function summariseTool(d: any) {
  const name = String(d?.name ?? 'tool').slice(0, 60);
  const args = d?.args;
  const verb = VERB[name] ?? name.replace(/_/g, ' ');
  const paths = pickPaths(args);
  let target = '';
  if (verb === 'run') target = String(args?.command ?? args?.cmd ?? '').split('\n')[0];
  else if (paths.length) target = paths.join(', ');
  else if (args && typeof args === 'object')
    target = String(args.query ?? args.pattern ?? args.glob_pattern ?? args.target_directory ?? args.url ?? args.search_term ?? args.toolName ?? args.server ?? '');
  target = target.replace(/\s+/g, ' ').trim();
  if (target.length > 140) target = target.slice(0, 140) + '…';
  return {
    callId: String(d?.callId ?? '').slice(0, 200),
    name,
    status: String(d?.status ?? ''),
    verb,
    label: target ? `${verb} ${target}` : verb,
    paths,
    truncated: !!d?.truncated?.args,
  };
}

/** Incremental SSE parser (handles \r\n, multi-line data, comments). */
export function sseParser(onEvent: (ev: { event: string; data: string; id?: string }) => void) {
  let buf = '';
  let event = '';
  let data: string[] = [];
  let id: string | undefined;
  const flush = () => {
    if (data.length || event) onEvent({ event: event || 'message', data: data.join('\n'), id });
    event = '';
    data = [];
    id = undefined;
  };
  return (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.search(/\r\n|\r|\n/)) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(buf[i] === '\r' && buf[i + 1] === '\n' ? i + 2 : i + 1);
      if (line === '') flush();
      else if (line.startsWith(':')) continue;
      else {
        const c = line.indexOf(':');
        const field = c < 0 ? line : line.slice(0, c);
        const value = c < 0 ? '' : line.slice(c + 1).replace(/^ /, '');
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
        else if (field === 'id') id = value;
      }
    }
  };
}

class Sink {
  res: ServerResponse;
  closed = false;
  lastId?: string;
  constructor(res: ServerResponse) {
    this.res = res;
  }
  send(event: string, data: unknown, id?: string) {
    if (this.closed || this.res.writableEnded) return;
    let s = '';
    if (id && !/[\r\n]/.test(id)) {
      s += `id: ${id}\n`;
      this.lastId = id;
    }
    s += `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.res.write(s);
  }
  comment(text: string) {
    if (!this.closed && !this.res.writableEnded) this.res.write(`: ${text}\n\n`);
  }
  end() {
    if (this.closed) return;
    this.closed = true;
    if (!this.res.writableEnded) this.res.end();
  }
}

class UpstreamStatus extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(`upstream ${status} ${code}`);
    this.status = status;
    this.code = code;
  }
}

async function getJson(deps: StreamDeps, path: string, signal: AbortSignal) {
  const r = await fetch(deps.base + path, {
    headers: { Authorization: deps.auth, Accept: 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]),
  });
  const text = await r.text();
  let d: any = {};
  try {
    d = text ? JSON.parse(text) : {};
  } catch {
    /* ignore */
  }
  if (!r.ok) throw new UpstreamStatus(r.status, String(d?.code ?? d?.error?.code ?? `UPSTREAM_${r.status}`));
  return d;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((res) => {
    const t = setTimeout(res, ms);
    signal.addEventListener('abort', () => (clearTimeout(t), res()), { once: true });
  });

// ---------------------------------------------------------------- stream mode

type StreamOutcome = { kind: 'done' } | { kind: 'fallback'; reason: string } | { kind: 'aborted' };

async function runStream(
  deps: StreamDeps,
  id: string,
  sink: Sink,
  signal: AbortSignal,
  opts: StreamOpts,
): Promise<StreamOutcome> {
  // 1) resolve the run (retry briefly: a just-launched agent may not have a run yet)
  let runId: string | undefined;
  let lastErr = '';
  for (let i = 0; i < 4 && !signal.aborted; i++) {
    try {
      const a = await getJson(deps, `/v1/agents/${id}`, signal);
      runId = typeof a.latestRunId === 'string' ? a.latestRunId : undefined;
      if (runId) break;
      lastErr = 'agent has no run yet';
    } catch (e) {
      if (signal.aborted) return { kind: 'aborted' };
      lastErr = e instanceof UpstreamStatus ? `v1 GET agent ${e.status} ${e.code}` : 'v1 GET agent failed';
      // Only a 404 is worth retrying (a just-launched agent may not be visible on v1 yet).
      if (e instanceof UpstreamStatus && e.status !== 404 && e.status < 500) break;
    }
    await sleep(1000, signal);
  }
  if (signal.aborted) return { kind: 'aborted' };
  if (!runId) return { kind: 'fallback', reason: lastErr || 'no run id' };

  // 2) stale run guard: right after a follow-up, v1 can still point at the previous, long finished
  //    run. Replaying that would duplicate output the user already saw, so wait briefly for the new
  //    run; if none shows up, say so (hello.stale) and finish without a replay. The client retries.
  if (opts.lastRunId !== runId) {
    for (let i = 0; i < 9 && !signal.aborted; i++) {
      let run: any;
      try {
        run = await getJson(deps, `/v1/agents/${id}/runs/${runId}`, signal);
      } catch {
        break; // can't tell: stream it
      }
      const st = String(run?.status ?? '').toUpperCase();
      const age = Date.now() - (Date.parse(run?.updatedAt ?? '') || Date.now());
      if (!TERMINAL.test(st) || age < STALE_RUN_MS) break;
      if (i === 8) {
        sink.send('hello', { mode: 'stream', agentId: id, runId, stale: true });
        return { kind: 'done' };
      }
      await sleep(1000, signal);
      try {
        const a = await getJson(deps, `/v1/agents/${id}`, signal);
        if (typeof a.latestRunId === 'string' && a.latestRunId !== runId) {
          runId = a.latestRunId;
          break;
        }
      } catch {
        /* keep waiting */
      }
    }
    if (signal.aborted) return { kind: 'aborted' };
  }

  let lastEventId = opts.lastRunId === runId ? opts.lastEventId : undefined;
  let reconnects = 0;
  let sawDone = false;
  let terminal = false;
  let greeted = false;
  let dropNote: string | undefined;

  while (!signal.aborted) {
    const ac = new AbortController();
    const onAbort = () => ac.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    let idle: NodeJS.Timeout | undefined;
    const bump = () => {
      clearTimeout(idle);
      idle = setTimeout(() => ac.abort(), UPSTREAM_IDLE_MS);
    };
    try {
      const r = await fetch(`${deps.base}/v1/agents/${id}/runs/${runId}/stream`, {
        headers: {
          Authorization: deps.auth,
          Accept: 'text/event-stream',
          ...(lastEventId ? { 'Last-Event-ID': lastEventId } : {}),
        },
        signal: ac.signal,
      });
      if (r.status === 400 && lastEventId) {
        // invalid_last_event_id (e.g. id from another run): replay from the start instead.
        await r.body?.cancel().catch(() => {});
        lastEventId = undefined;
        continue;
      }
      if (!r.ok || !r.body) {
        await r.body?.cancel().catch(() => {});
        return { kind: 'fallback', reason: r.status === 410 ? 'stream expired (410)' : `stream HTTP ${r.status}` };
      }
      if (!greeted) {
        greeted = true;
        sink.send('hello', { mode: 'stream', agentId: id, runId });
      }
      bump();
      /** Upstream `error` is held until we know whether a premature `done` follows it. */
      let pendingErr: { code: string; message: string; id?: string } | null = null;
      const flushErr = () => {
        if (pendingErr) sink.send('error', { code: pendingErr.code, message: pendingErr.message }, pendingErr.id);
        pendingErr = null;
      };
      const parse = sseParser((ev) => {
        if (ev.id) lastEventId = ev.id;
        let d: any = {};
        try {
          d = ev.data ? JSON.parse(ev.data) : {};
        } catch {
          return;
        }
        if (ev.event !== 'error' && ev.event !== 'done' && ev.event !== 'heartbeat') flushErr();
        if (ev.event === 'assistant' || ev.event === 'thinking' || ev.event === 'tool_call') reconnects = 0; // making progress
        switch (ev.event) {
          case 'status':
            if (typeof d.status === 'string') {
              sink.send('status', { status: d.status.toUpperCase(), runId: d.runId ?? runId }, ev.id);
              if (TERMINAL.test(d.status.toUpperCase())) terminal = true;
            }
            break;
          case 'assistant':
            if (d.text) sink.send('assistant', { text: clip(d.text) }, ev.id);
            break;
          case 'thinking':
            if (d.text) sink.send('thinking', { text: clip(d.text) }, ev.id);
            break;
          case 'tool_call':
            sink.send('tool', summariseTool(d), ev.id);
            break;
          case 'result': {
            terminal = true;
            const b = d.git?.branches?.[0];
            sink.send(
              'result',
              {
                status: String(d.status ?? 'FINISHED').toUpperCase(),
                text: clip(d.text, 4000) || undefined,
                durationMs: typeof d.durationMs === 'number' ? d.durationMs : undefined,
                branch: typeof b?.branch === 'string' ? b.branch : undefined,
                prUrl: typeof b?.prUrl === 'string' ? b.prUrl : undefined,
              },
              ev.id,
            );
            break;
          }
          case 'error':
            flushErr();
            pendingErr = { code: String(d.code ?? 'UPSTREAM_STREAM_ERROR'), message: clip(d.message, 300), id: ev.id };
            break;
          case 'done':
            sawDone = true;
            break;
          default:
            // heartbeat, interaction_update (richer duplicate of the simplified events): dropped.
            break;
        }
      });
      const dec = new TextDecoder();
      for await (const chunk of r.body as unknown as AsyncIterable<Uint8Array>) {
        bump();
        parse(dec.decode(chunk, { stream: true }));
        if (sawDone) break;
      }
      clearTimeout(idle);
      if (sawDone && terminal) {
        flushErr();
        ac.abort();
        return { kind: 'done' };
      }
      if (signal.aborted) return { kind: 'aborted' };
      if (sawDone) {
        // Verified live 2026-10-06: a stream opened while the run is CREATING can end with
        // error stream_unavailable + done right as the run starts. The run is not over: resume.
        ac.abort();
        const pe = pendingErr as { code: string; message: string } | null; // assigned inside the parser callback
        dropNote = pe ? `${pe.code}: ${pe.message}` : 'upstream sent done before the run ended';
        pendingErr = null;
        sawDone = false;
      } else if (terminal) {
        flushErr();
        return { kind: 'done' }; // closed without `done` after the result
      } else flushErr();
    } catch {
      clearTimeout(idle);
      if (signal.aborted) return { kind: 'aborted' };
    } finally {
      clearTimeout(idle);
      signal.removeEventListener('abort', onAbort);
    }
    if (++reconnects > MAX_RECONNECTS) return { kind: 'fallback', reason: 'stream kept dropping' };
    sink.send('error', {
      code: 'UPSTREAM_DROPPED',
      message: `${dropNote ?? 'upstream stream dropped'}, resuming (${reconnects}/${MAX_RECONNECTS})`,
    });
    dropNote = undefined;
    await sleep(500 * reconnects, signal);
  }
  return { kind: 'aborted' };
}

// ---------------------------------------------------------------- poll mode (fallback)

async function runPoll(deps: StreamDeps, id: string, sink: Sink, signal: AbortSignal, reason: string): Promise<void> {
  sink.send('hello', { mode: 'poll', agentId: id, reason });
  let prev: { type: string; text: string }[] | null = null;
  let lastStatus = '';
  let tick = 0;
  let failures = 0;
  while (!signal.aborted) {
    try {
      if (tick % STATUS_EVERY === 0) {
        const a = await deps.status(id);
        const st = a.status.toUpperCase();
        if (TERMINAL.test(st) && prev) {
          // one last transcript diff below, then result (carries the terminal status) and finish
          lastStatus = st;
          tick = -1;
        } else if (st !== lastStatus) {
          lastStatus = st;
          sink.send('status', { status: st });
        }
      }
      const msgs = (await deps.conversation(id)).filter((m) => m.type !== 'status');
      if (!prev) {
        const recent = msgs.slice(-HISTORY_MAX).map((m) => ({ type: m.type, text: clip(m.text, 2000) }));
        sink.send('history', { messages: recent, total: msgs.length });
      } else {
        // v0 message ids are not stable between requests: diff by position + content.
        for (let i = 0; i < msgs.length; i++) {
          const m = msgs[i];
          const old = prev[i];
          if (!old) {
            if (m.type === 'user') sink.send('user', { text: clip(m.text, 2000), msg: i });
            else if (m.text) sink.send('assistant', { text: clip(m.text), msg: i });
          } else if (old.type === m.type && m.text.length > old.text.length && m.text.startsWith(old.text)) {
            // `msg` lets the client keep a late continuation of an older message on its own line.
            if (m.type === 'assistant') sink.send('assistant', { text: clip(m.text.slice(old.text.length)), msg: i });
          }
        }
      }
      prev = msgs.map((m) => ({ type: m.type, text: m.text }));
      failures = 0;
      if (tick === -1) {
        const a = await deps.status(id).catch(() => undefined);
        sink.send('result', {
          status: lastStatus,
          text: a?.summary ? clip(a.summary, 4000) : undefined,
          branch: a?.branch,
          prUrl: a?.prUrl,
        });
        return;
      }
    } catch (e) {
      if (signal.aborted) return;
      const code = (e as { code?: string })?.code ?? 'POLL_FAILED';
      const status = (e as { status?: number })?.status;
      if (status === 404) {
        sink.send('error', { code: 'NOT_FOUND', message: 'agent not found', fatal: true });
        return;
      }
      if (status && status >= 400 && status < 500 && status !== 429) {
        sink.send('error', { code: String(code), message: `transcript request refused (${status})`, fatal: true });
        return;
      }
      if (++failures >= 5) {
        sink.send('error', { code: String(code), message: 'transcript polling keeps failing', fatal: true });
        return;
      }
    }
    tick++;
    await sleep(POLL_MS, signal);
  }
}

// ---------------------------------------------------------------- entry

export function handleAgentStream(req: IncomingMessage, res: ServerResponse, id: string, deps: StreamDeps, opts: StreamOpts) {
  if (openStreams >= MAX_STREAMS) {
    res.statusCode = 429;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'too many live streams', code: 'TOO_MANY_STREAMS' }));
    return;
  }
  openStreams++;
  streamStats.opened++;
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.flushHeaders?.();
  req.socket.setNoDelay?.(true);
  req.socket.setTimeout?.(0);

  const sink = new Sink(res);
  const ac = new AbortController();
  sink.res.write('retry: 3000\n\n');
  sink.comment('fleet live link');
  const hb = setInterval(() => sink.send('ping', { t: Date.now() }), HEARTBEAT_MS);
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    clearInterval(hb);
    if (!ac.signal.aborted) {
      ac.abort();
      streamStats.upstreamAborts++;
    }
    openStreams--;
    streamStats.closed++;
  };
  // Client went away (tab closed, EventSource.close()): abort upstream fetches / polling.
  res.on('close', cleanup);

  void (async () => {
    try {
      let outcome: StreamOutcome = { kind: 'fallback', reason: 'forced poll mode' };
      if (opts.forceMode !== 'poll') outcome = await runStream(deps, id, sink, ac.signal, opts);
      if (outcome.kind === 'fallback' && !ac.signal.aborted) await runPoll(deps, id, sink, ac.signal, outcome.reason);
    } catch {
      sink.send('error', { code: 'BRIDGE_STREAM_ERROR', message: 'bridge stream error', fatal: true });
    } finally {
      if (!ac.signal.aborted) sink.send('done', {});
      sink.end();
      cleanup();
    }
  })();
}
