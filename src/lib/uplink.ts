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
  launch: (prompt: string, repo: string, ref: string) =>
    call<{ apiVersion: string; agent: CloudAgent }>('POST', '/api/agents', { prompt, repo, ref }, 45_000),
};
