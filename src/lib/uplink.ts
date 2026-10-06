/**
 * Browser client for the local LIVE COMMAND UPLINK bridge (plugins/cursorAgentsApi.ts).
 * The browser only ever talks to /api/agents on its own origin; the bridge holds the API key.
 */

export interface CloudAgent {
  id: string;
  name: string;
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

export interface CloudMessage {
  id: string;
  type: 'user' | 'assistant' | 'status';
  text: string;
}

export type UplinkResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; error: string };

export const DEFAULT_REPO = 'https://github.com/meabs/AgentForce';
export const DEFAULT_REF = 'main';
export const OFFLINE_MSG = 'Uplink offline: set CURSOR_API_KEY';

export const isCloudId = (id: string | undefined | null): id is string => !!id && /^bc[-_]/.test(id);

/** The static demo build (GitHub Pages) has no bridge: never hit /api, just report offline. */
const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === '1';

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 25_000): Promise<UplinkResult<T>> {
  if (STATIC_DEMO) return { ok: false, status: 0, code: 'STATIC_DEMO', error: 'Uplink unavailable in the static demo build' };
  try {
    const res = await fetch(path, {
      method,
      cache: 'no-store',
      headers: body !== undefined || method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
      body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
    let data: any = null;
    try {
      data = await res.json();
    } catch {
      /* non-JSON (e.g. bridge missing → index.html) */
    }
    if (!res.ok || !data || typeof data !== 'object') {
      const code = data?.code ?? (res.ok ? 'BAD_RESPONSE' : `HTTP_${res.status}`);
      const error = res.status === 503 && code === 'NO_API_KEY' ? OFFLINE_MSG : (data?.error ?? `bridge HTTP ${res.status}`);
      return { ok: false, status: res.ok ? 502 : res.status, code, error };
    }
    return { ok: true, status: res.status, data: data as T };
  } catch (e) {
    return { ok: false, status: 0, code: 'NETWORK', error: e instanceof Error ? e.message : String(e) };
  }
}

const enc = encodeURIComponent;

export const uplink = {
  list: (limit = 10) => call<{ apiVersion: string; agents: CloudAgent[] }>('GET', `/api/agents?limit=${limit}`),
  get: (id: string) => call<{ apiVersion: string; agent: CloudAgent }>('GET', `/api/agents/${enc(id)}`),
  conversation: (id: string) =>
    call<{ apiVersion: string; id: string; messages: CloudMessage[] }>('GET', `/api/agents/${enc(id)}/conversation`),
  followup: (id: string, text: string) =>
    call<{ ok: true; id: string; runId?: string }>('POST', `/api/agents/${enc(id)}/followup`, { text }),
  stop: (id: string) => call<{ ok: true; id: string }>('POST', `/api/agents/${enc(id)}/stop`, {}),
  launch: (prompt: string, repo: string, ref: string, model?: string) =>
    call<{ apiVersion: string; agent: CloudAgent }>('POST', '/api/agents', { prompt, repo, ref, ...(model ? { model } : {}) }, 45_000),
  models: () => call<{ apiVersion: string; models: string[] }>('GET', '/api/models'),
};

/** Turn a bridge / API failure into a sentence a human can act on. */
export function friendlyError(r: { status: number; code: string; error: string }): string {
  if (r.code === 'STATIC_DEMO') return 'Not available in the static demo (no server, no API key).';
  if (r.status === 503 || r.code === 'NO_API_KEY') return 'Not connected: add CURSOR_API_KEY to .env.local (the bridge picks it up within seconds).';
  if (r.status === 401) return 'Cursor rejected the API key (401). Check CURSOR_API_KEY in .env.local.';
  if (r.status === 403) return `Forbidden (403): ${r.error}`;
  if (r.status === 404) return 'Not found (404): the agent no longer exists.';
  if (r.status === 409) return `Conflict (409): ${r.error}. The agent may be busy, or already stopped.`;
  if (r.status === 429) return 'Rate limited by the Cursor API (429). Wait a minute and try again.';
  if (r.status === 504 || r.code === 'UPSTREAM_TIMEOUT') return 'The Cursor API timed out. Try again.';
  if (r.status === 0 || r.code === 'NETWORK') return `Cannot reach the local bridge (${r.error}). Is npm run dev still running?`;
  if (r.code === 'BAD_REPO') return 'Repository must be a full https URL, for example https://github.com/owner/repo.';
  if (r.code === 'BAD_REF') return 'Branch or ref must not contain spaces.';
  if (r.code === 'BAD_MODEL') return 'That model id is not valid.';
  if (r.code === 'PROMPT_REQUIRED' || r.code === 'TEXT_REQUIRED') return 'Write a prompt first.';
  return `${r.status ? `HTTP ${r.status}: ` : ''}${r.error}`;
}

/** Accepts owner/repo, github.com/owner/repo or a full URL. Returns a normalised https URL or an error. */
export function normaliseRepo(input: string): { url?: string; error?: string } {
  const v = input.trim();
  if (!v) return { error: 'Repository is required.' };
  if (/^[\w-]+\/[\w.-]+$/.test(v)) return { url: `https://github.com/${v.replace(/\.git$/, '')}` };
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return { error: 'Use an https:// repository URL.' };
    if (u.username || u.password) return { error: 'Do not put credentials in the URL.' };
    if (u.pathname.replace(/\/+$/, '').split('/').filter(Boolean).length < 2) return { error: 'Expected owner/repo, e.g. https://github.com/owner/repo.' };
    return { url: `${u.origin}${u.pathname.replace(/\/+$/, '').replace(/\.git$/, '')}` };
  } catch {
    return { error: 'Not a valid repository URL.' };
  }
}
