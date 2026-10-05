// Shared helpers for the CURSOR-7 live feed (bridge file -> public/cursor-live.json).
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PUBLIC_PATH = resolve(ROOT, 'public', 'cursor-live.json');
export const DIST_PATH = resolve(ROOT, 'dist', 'cursor-live.json');
export const BRIDGE_PATH = resolve(
  process.env.CURSOR_BRIDGE_PATH || process.env.AGENT_STATUS_PATH || resolve(ROOT, '.cursor-bridge', 'status.json'),
);

export const DEFAULT_ID = 'bc-da944dc0-9bd4-5ff1-8af9-0341f425d71f';
export const DEFAULTS = Object.freeze({
  id: DEFAULT_ID,
  name: 'CURSOR-7',
  title: 'Cloud Agent Mission',
  state: 'RUNNING',
  url: `https://cursor.com/agents/${DEFAULT_ID}`,
  summary: '',
});

const FIELDS = ['id', 'name', 'title', 'state', 'url', 'updatedAt', 'summary'];

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** Accept loose input (e.g. {status, name} or {agent:{...}}) and produce the live shape. */
export function normalize(input, prev = {}) {
  const src = input && typeof input === 'object' ? (input.agent ?? input) : {};
  const pick = (...keys) => {
    for (const k of keys) if (src[k] !== undefined && src[k] !== null && src[k] !== '') return src[k];
    return undefined;
  };
  const id = String(pick('id', 'agentId', 'bcId') ?? prev.id ?? DEFAULTS.id);
  const out = {
    id,
    name: String(pick('boardName', 'name') ?? prev.name ?? DEFAULTS.name),
    title: String(pick('title', 'mission') ?? prev.title ?? DEFAULTS.title),
    state: String(pick('state', 'status') ?? prev.state ?? DEFAULTS.state).toUpperCase(),
    url: String(pick('url', 'link') ?? (prev.id === id ? prev.url : undefined) ?? `https://cursor.com/agents/${id}`),
    updatedAt: String(pick('updatedAt', 'updated_at') ?? new Date().toISOString()),
    summary: String(pick('summary', 'activity', 'message', 'lastMessage') ?? prev.summary ?? ''),
  };
  return Object.fromEntries(FIELDS.map((f) => [f, out[f]]));
}

/** Compare ignoring updatedAt. */
export function sameContent(a, b) {
  if (!a || !b) return false;
  return FIELDS.filter((f) => f !== 'updatedAt').every((f) => a[f] === b[f]);
}

export function atomicWrite(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  renameSync(tmp, path);
}

/** Write the live file (and dist copy if a build exists and mirrorDist). */
export function writeLive(obj, { mirrorDist = true } = {}) {
  atomicWrite(PUBLIC_PATH, obj);
  if (mirrorDist) {
    try {
      readFileSync(resolve(ROOT, 'dist', 'index.html'));
      atomicWrite(DIST_PATH, obj);
    } catch {
      /* no build present */
    }
  }
}
