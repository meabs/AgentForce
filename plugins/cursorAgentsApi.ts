import type { Plugin, Connect } from 'vite';
import { loadEnv } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * LIVE COMMAND UPLINK: server-side bridge to the Cursor Cloud Agents API.
 *
 * Browser  ──/api/agents/*──▶  this middleware (adds auth)  ──▶  https://api.cursor.com
 *
 * - The API key comes from CURSOR_API_KEY (process env, or .env / .env.local / .env.[mode](.local)).
 *   It never reaches the browser and is never logged.
 * - Loopback clients only, Host must be localhost, cross-origin requests are refused.
 * - Without a key every route answers 503 { code: "NO_API_KEY" }.
 *
 * Routes (all JSON):
 *   GET  /api/agents                    list agents             -> { apiVersion, agents: AgentDTO[] }
 *   POST /api/agents {prompt,repo,ref}  launch (Summon)         -> { agent: AgentDTO }
 *   GET  /api/agents/:id                status + summary        -> { agent: AgentDTO }
 *   GET  /api/agents/:id/conversation   transcript              -> { id, messages: MessageDTO[] }
 *   POST /api/agents/:id/followup {text}  follow-up (Assign)    -> { ok, id, runId? }
 *   POST /api/agents/:id/stop           stop / cancel (Retreat) -> { ok, id }
 *
 * Upstream: legacy v0 by default (has a full conversation endpoint and a resumable stop);
 * set CURSOR_API_VERSION=v1 to use the current runs-based v1 surface instead.
 */

const MAX_BODY = 32 * 1024;
const MAX_PROMPT = 20_000;
const UPSTREAM_TIMEOUT_MS = 20_000;
const DEFAULT_BASE = 'https://api.cursor.com';
export const DEFAULT_REPO = 'https://github.com/meabs/AgentForce';
export const DEFAULT_REF = 'main';
const ID_RE = /^bc[-_][A-Za-z0-9_-]{4,80}$/;

export interface AgentDTO {
  id: string;
  name: string;
  /** Raw upstream status, upper-cased (CREATING, RUNNING, FINISHED, ERROR, ACTIVE, IDLE, …) */
  status: string;
  summary?: string;
  url: string;
  repo?: string;
  ref?: string;
  branch?: string;
  prUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  latestRunId?: string;
}

export interface MessageDTO {
  id: string;
  type: 'user' | 'assistant' | 'status';
  text: string;
}

type Env = { key: string | undefined; version: 'v0' | 'v1'; base: string };

class HttpError extends Error {
  status: number;
  code: string;
  detail?: unknown;
  constructor(status: number, code: string, message: string, detail?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------- env

function makeEnvReader(root: string, mode: string) {
  let cache: { at: number; env: Env } | null = null;
  return (): Env => {
    // Re-read env files every few seconds so adding a key to .env.local doesn't need a restart.
    if (cache && Date.now() - cache.at < 3000) return cache.env;
    const fileEnv = loadEnv(mode, root, 'CURSOR_');
    const key = (process.env.CURSOR_API_KEY || fileEnv.CURSOR_API_KEY || '').trim() || undefined;
    const v = (process.env.CURSOR_API_VERSION || fileEnv.CURSOR_API_VERSION || 'v0').trim().toLowerCase();
    const base = (process.env.CURSOR_API_BASE || fileEnv.CURSOR_API_BASE || DEFAULT_BASE).trim().replace(/\/+$/, '');
    const env: Env = { key, version: v === 'v1' ? 'v1' : 'v0', base: /^https?:\/\//.test(base) ? base : DEFAULT_BASE };
    cache = { at: Date.now(), env };
    return env;
  };
}

// ---------------------------------------------------------------- http helpers

function isLoopback(req: IncomingMessage) {
  const a = req.socket.remoteAddress ?? '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Blocks DNS-rebinding (Host) and cross-site requests (Origin) from other web pages. */
function sameOriginLocal(req: IncomingMessage) {
  const host = req.headers.host ?? '';
  if (!LOCAL_HOST_RE.test(host)) return false;
  const origin = req.headers.origin;
  if (!origin) return true; // curl / same-origin GET without Origin
  try {
    const u = new URL(origin);
    return LOCAL_HOST_RE.test(u.host) && u.host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function send(res: ServerResponse, code: number, body: unknown) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'BODY_TOO_LARGE', 'body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('error', reject);
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      if (!raw) return resolve({});
      try {
        const v = JSON.parse(raw);
        if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('not an object');
        resolve(v as Record<string, unknown>);
      } catch {
        reject(new HttpError(400, 'INVALID_JSON', 'invalid JSON body'));
      }
    });
  });
}

// ---------------------------------------------------------------- upstream

async function upstream<T = any>(env: Env, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const auth = 'Basic ' + Buffer.from(`${env.key}:`).toString('base64');
  let res: Response;
  try {
    res = await fetch(`${env.base}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new HttpError(timeout ? 504 : 502, timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_UNREACHABLE',
      timeout ? 'Cursor API timed out' : 'Cursor API unreachable');
  }
  const text = await res.text();
  let data: any = undefined;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  if (!res.ok) {
    const msg =
      (data && (data.message || data.error?.message || (typeof data.error === 'string' ? data.error : ''))) ||
      `Cursor API ${res.status}`;
    const code = (data && (data.code || data.error?.code)) || `UPSTREAM_${res.status}`;
    // Pass through meaningful client errors; collapse 5xx to 502.
    const status = res.status >= 500 ? 502 : res.status;
    throw new HttpError(status, String(code), String(msg).slice(0, 400));
  }
  return data as T;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v : undefined;
}

/** v0 GET returns `github.com/owner/repo` while launch echoes `https://github.com/owner/repo`; normalise. */
function repoUrl(v: unknown): string | undefined {
  const s = str(v)?.trim();
  if (!s) return undefined;
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s.replace(/^\/+/, '')}`;
}

// ---- v0 adapters
function fromV0(a: any): AgentDTO {
  return {
    id: String(a.id),
    name: str(a.name) ?? String(a.id),
    status: String(a.status ?? 'UNKNOWN').toUpperCase(),
    summary: str(a.summary),
    url: str(a.target?.url) ?? `https://cursor.com/agents?id=${a.id}`,
    repo: repoUrl(a.source?.repository),
    ref: str(a.source?.ref),
    branch: str(a.target?.branchName),
    prUrl: str(a.target?.prUrl),
    createdAt: str(a.createdAt),
    updatedAt: str(a.updatedAt),
  };
}

// ---- v1 adapters
function fromV1(a: any, run?: any): AgentDTO {
  const b = run?.git?.branches?.[0];
  return {
    id: String(a.id),
    name: str(a.name) ?? String(a.id),
    // Execution status lives on the run; fall back to the agent lifecycle status (ACTIVE/IDLE/ARCHIVED).
    status: String(run?.status ?? a.status ?? 'UNKNOWN').toUpperCase(),
    summary: str(run?.result),
    url: str(a.url) ?? `https://cursor.com/agents/${a.id}`,
    repo: repoUrl(a.repos?.[0]?.url),
    ref: str(a.repos?.[0]?.startingRef),
    branch: str(b?.branch),
    prUrl: str(b?.prUrl),
    createdAt: str(a.createdAt),
    updatedAt: str(run?.updatedAt) ?? str(a.updatedAt),
    latestRunId: str(a.latestRunId) ?? str(run?.id),
  };
}

const api = {
  async list(env: Env, limit: number): Promise<AgentDTO[]> {
    if (env.version === 'v0') {
      const d = await upstream(env, 'GET', `/v0/agents?limit=${limit}`);
      return (Array.isArray(d.agents) ? d.agents : []).map(fromV0);
    }
    const d = await upstream(env, 'GET', `/v1/agents?limit=${limit}&includeArchived=false`);
    return (Array.isArray(d.items) ? d.items : []).map((a: any) => fromV1(a));
  },

  async get(env: Env, id: string): Promise<AgentDTO> {
    if (env.version === 'v0') return fromV0(await upstream(env, 'GET', `/v0/agents/${id}`));
    const a = await upstream(env, 'GET', `/v1/agents/${id}`);
    let run: any;
    if (a.latestRunId) run = await upstream(env, 'GET', `/v1/agents/${id}/runs/${a.latestRunId}`).catch(() => undefined);
    return fromV1(a, run);
  },

  async conversation(env: Env, id: string): Promise<MessageDTO[]> {
    if (env.version === 'v0') {
      const d = await upstream(env, 'GET', `/v0/agents/${id}/conversation`);
      return (Array.isArray(d.messages) ? d.messages : []).map((m: any, i: number) => ({
        id: String(m.id ?? `m${i}`),
        type: String(m.type).startsWith('user') ? 'user' : 'assistant',
        text: String(m.text ?? ''),
      }));
    }
    // v1 has no transcript endpoint: synthesise one from runs (status + final result per run).
    const d = await upstream(env, 'GET', `/v1/agents/${id}/runs?limit=20`);
    const runs: any[] = (Array.isArray(d.items) ? d.items : []).slice().reverse();
    const out: MessageDTO[] = [];
    for (const r of runs) {
      out.push({ id: `${r.id}:${r.status}`, type: 'status', text: `run ${r.id} · ${String(r.status).toUpperCase()}` });
      if (str(r.result)) out.push({ id: `${r.id}:result`, type: 'assistant', text: r.result });
    }
    return out;
  },

  async launch(env: Env, prompt: string, repo: string, ref: string): Promise<AgentDTO> {
    if (env.version === 'v0') {
      const d = await upstream(env, 'POST', '/v0/agents', {
        prompt: { text: prompt },
        source: { repository: repo, ...(ref ? { ref } : {}) },
        // Fleet units report back; they never open PRs on their own.
        target: { autoCreatePr: false },
      });
      return fromV0(d);
    }
    const d = await upstream(env, 'POST', '/v1/agents', {
      prompt: { text: prompt },
      repos: [{ url: repo, ...(ref ? { startingRef: ref } : {}) }],
      autoCreatePR: false,
    });
    return fromV1(d.agent ?? d, d.run);
  },

  async followup(env: Env, id: string, text: string): Promise<{ runId?: string }> {
    if (env.version === 'v0') {
      await upstream(env, 'POST', `/v0/agents/${id}/followup`, { prompt: { text } });
      return {};
    }
    const d = await upstream(env, 'POST', `/v1/agents/${id}/runs`, { prompt: { text } });
    return { runId: str(d.run?.id) };
  },

  async stop(env: Env, id: string): Promise<{ runId?: string }> {
    if (env.version === 'v0') {
      await upstream(env, 'POST', `/v0/agents/${id}/stop`);
      return {};
    }
    const a = await upstream(env, 'GET', `/v1/agents/${id}`);
    if (!a.latestRunId) throw new HttpError(409, 'NO_ACTIVE_RUN', 'agent has no run to cancel');
    await upstream(env, 'POST', `/v1/agents/${id}/runs/${a.latestRunId}/cancel`);
    return { runId: a.latestRunId };
  },
};

// ---------------------------------------------------------------- router

function validRepo(v: string) {
  try {
    const u = new URL(v);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password && u.pathname.length > 1;
  } catch {
    return false;
  }
}

async function route(env: Env, req: IncomingMessage, res: ServerResponse, url: URL) {
  const parts = url.pathname.replace(/\/+$/, '').split('/').slice(3); // after /api/agents
  const method = req.method ?? 'GET';

  if (!env.key) {
    throw new HttpError(503, 'NO_API_KEY', 'Uplink offline: set CURSOR_API_KEY', {
      hint: 'Add CURSOR_API_KEY=... to .env.local (or export it) and the bridge picks it up within a few seconds.',
    });
  }

  if (parts.length === 0) {
    if (method === 'GET') {
      const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20));
      return send(res, 200, { apiVersion: env.version, agents: await api.list(env, limit) });
    }
    if (method === 'POST') {
      const body = await readBody(req);
      const prompt = str(body.prompt)?.trim();
      const repo = (str(body.repo) ?? DEFAULT_REPO).trim();
      const ref = (str(body.ref) ?? DEFAULT_REF).trim();
      if (!prompt) throw new HttpError(400, 'PROMPT_REQUIRED', 'prompt is required');
      if (prompt.length > MAX_PROMPT) throw new HttpError(400, 'PROMPT_TOO_LONG', `prompt over ${MAX_PROMPT} chars`);
      if (!validRepo(repo)) throw new HttpError(400, 'BAD_REPO', 'repo must be an http(s) repository URL');
      if (ref.length > 200 || /\s/.test(ref)) throw new HttpError(400, 'BAD_REF', 'invalid ref');
      return send(res, 201, { apiVersion: env.version, agent: await api.launch(env, prompt, repo, ref) });
    }
    throw new HttpError(405, 'METHOD', 'GET or POST');
  }

  const id = decodeURIComponent(parts[0]);
  if (!ID_RE.test(id)) throw new HttpError(400, 'BAD_ID', 'agent id must look like bc-…');
  const action = parts[1];
  if (parts.length > 2) throw new HttpError(404, 'NOT_FOUND', 'unknown route');

  if (!action && method === 'GET') return send(res, 200, { apiVersion: env.version, agent: await api.get(env, id) });
  if (action === 'conversation' && method === 'GET')
    return send(res, 200, { apiVersion: env.version, id, messages: await api.conversation(env, id) });
  if (action === 'followup' && method === 'POST') {
    const body = await readBody(req);
    const text = str(body.text)?.trim();
    if (!text) throw new HttpError(400, 'TEXT_REQUIRED', 'text is required');
    if (text.length > MAX_PROMPT) throw new HttpError(400, 'TEXT_TOO_LONG', `text over ${MAX_PROMPT} chars`);
    return send(res, 200, { ok: true, id, ...(await api.followup(env, id, text)) });
  }
  if (action === 'stop' && method === 'POST') return send(res, 200, { ok: true, id, ...(await api.stop(env, id)) });
  throw new HttpError(404, 'NOT_FOUND', 'unknown route');
}

export function cursorAgentsApi(opts: { root?: string; mode?: string } = {}): Plugin {
  let readEnv = makeEnvReader(opts.root ?? process.cwd(), opts.mode ?? 'development');

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url || !/^\/api\/agents(\/|\?|$)/.test(req.url)) return next();
    if (!isLoopback(req)) return send(res, 403, { error: 'loopback only', code: 'FORBIDDEN' });
    if (!sameOriginLocal(req)) return send(res, 403, { error: 'cross-origin request refused', code: 'FORBIDDEN' });
    if (req.method === 'POST' && !String(req.headers['content-type'] ?? '').includes('application/json')) {
      return send(res, 415, { error: 'Content-Type must be application/json', code: 'UNSUPPORTED_MEDIA' });
    }
    const url = new URL(req.url, 'http://localhost');
    const env = readEnv();
    route(env, req, res, url).catch((e: unknown) => {
      if (res.writableEnded) return;
      if (e instanceof HttpError) {
        return send(res, e.status, { error: e.message, code: e.code, ...(e.detail ? { detail: e.detail } : {}) });
      }
      // Never echo internals (could include headers); keep it generic.
      send(res, 500, { error: 'bridge error', code: 'BRIDGE_ERROR' });
    });
  };

  return {
    name: 'cursor-agents-api',
    configResolved(config) {
      readEnv = makeEnvReader(opts.root ?? config.root, opts.mode ?? config.mode);
    },
    configureServer(server) {
      server.middlewares.use(handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handler);
    },
  };
}
