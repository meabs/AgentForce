/**
 * TERRITORY: a repository rendered as a fog-of-war map.
 *
 * Files are sorted by path and laid along a Hilbert curve, so every directory becomes a
 * contiguous "district" on the grid. Tiles are revealed when an agent touches the file.
 */

export interface Tile {
  i: number;
  gx: number;
  gy: number;
  /** Map-space centre (0-100) for the isometric tactical map. */
  x: number;
  y: number;
  path?: string;
  dir: string;
}

export interface District {
  dir: string;
  label: string;
  x: number;
  y: number;
  gx: number;
  gy: number;
  count: number;
}

export interface Territory {
  key: string;
  label: string;
  /** Repo URL (real repos) */
  repo?: string;
  size: number;
  tiles: Tile[];
  byPath: Record<string, Tile>;
  files: string[];
  districts: District[];
  /** true when the full file tree is known (real fog); false = only charted files */
  complete: boolean;
}

export interface Touch {
  agentId: string;
  name: string;
  color: string;
  at: number;
  count: number;
  kind: 'read' | 'edit';
}

export type TouchMap = Record<string, Record<string, Touch>>;

// ---------------------------------------------------------------- geometry

/** Hilbert curve index -> (x, y) on an n x n grid (n power of two). */
export function d2xy(n: number, d: number) {
  let x = 0;
  let y = 0;
  let t = d;
  for (let s = 1; s < n; s *= 2) {
    const rx = 1 & (t / 2);
    const ry = 1 & (t ^ rx);
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      [x, y] = [y, x];
    }
    x += s * rx;
    y += s * ry;
    t = Math.floor(t / 4);
  }
  return { x, y };
}

export const MAP_MIN = 29;
export const MAP_MAX = 71;

export function tileCenter(size: number, gx: number, gy: number) {
  const step = (MAP_MAX - MAP_MIN) / size;
  return { x: MAP_MIN + (gx + 0.5) * step, y: MAP_MIN + (gy + 0.5) * step };
}

const topDir = (p: string) => {
  const parts = p.split('/');
  if (parts.length <= 1) return '/';
  if ((parts[0] === 'src' || parts[0] === 'packages' || parts[0] === 'apps') && parts.length > 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
};

export function buildTerritory(key: string, label: string, paths: string[], opts: { repo?: string; complete?: boolean; labels?: Record<string, string> } = {}): Territory {
  const files = [...new Set(paths)].sort((a, b) => {
    const da = topDir(a);
    const db = topDir(b);
    return da === db ? a.localeCompare(b) : da.localeCompare(db);
  });
  const total = Math.max(1, files.length);
  let size = 4;
  while (size * size < total * 1.15 && size < 32) size *= 2;
  const T = size * size;
  const tiles: Tile[] = [];
  const byPath: Record<string, Tile> = {};
  // Spread files evenly along the curve; leftovers become empty terrain inside the district.
  const slot: (string | undefined)[] = new Array(T).fill(undefined);
  const capped = files.slice(0, T);
  capped.forEach((p, k) => {
    slot[Math.floor((k * T) / capped.length)] = p;
  });
  let lastDir = capped.length ? topDir(capped[0]) : '/';
  for (let i = 0; i < T; i++) {
    const { x: gx, y: gy } = d2xy(size, i);
    const path = slot[i];
    if (path) lastDir = topDir(path);
    const c = tileCenter(size, gx, gy);
    const tile: Tile = { i, gx, gy, x: c.x, y: c.y, path, dir: lastDir };
    tiles.push(tile);
    if (path) byPath[path] = tile;
  }
  const groups: Record<string, Tile[]> = {};
  for (const t of tiles) if (t.path) (groups[t.dir] ??= []).push(t);
  const districts: District[] = Object.entries(groups).map(([dir, ts]) => {
    const gx = ts.reduce((s, t) => s + t.gx, 0) / ts.length;
    const gy = ts.reduce((s, t) => s + t.gy, 0) / ts.length;
    const c = tileCenter(size, gx, gy);
    return { dir, label: opts.labels?.[dir] ?? dir.toUpperCase(), gx, gy, x: c.x, y: c.y, count: ts.length };
  });
  return { key, label, repo: opts.repo, size, tiles, byPath, files: capped, districts, complete: opts.complete ?? true };
}

// ---------------------------------------------------------------- path intel

const EXT =
  'tsx?|jsx?|mjs|cjs|css|scss|html?|md|mdx|json|ya?ml|toml|py|rs|go|java|kt|rb|php|cs|swift|sh|sql|lock|txt|env\\.example|svg|vue|svelte';
const PATH_RE = new RegExp(`(?:^|[\\s'"\`(\\[<:,])((?:\\.{0,2}/)?(?:[\\w@.+-]+/)*[\\w@.+-]+\\.(?:${EXT}))(?=$|[\\s'"\`)\\]>:,;!?]|\\.(?:\\s|$))`, 'g');
const KNOWN_ROOT = /^(README|CHANGELOG|LICENSE|CONTRIBUTING|AGENTS|CLAUDE|package|tsconfig|vite\.config|Dockerfile|Makefile|pyproject|Cargo|go)\b/i;

/** Normalise a path an agent mentioned: strip ./, sandbox prefixes and line numbers. */
export function normalisePath(p: string) {
  let s = p.trim().replace(/^\.\//, '');
  s = s.replace(/^\/?(?:workspace|home\/[\w.-]+(?:\/[\w.-]+)?|repo|app|src\/\.\.)\//, '');
  s = s.replace(/^\/+/, '');
  return s;
}

/** Pull plausible repo file paths out of free text (agent summaries, transcripts, terminal lines). */
export function extractPaths(text: string): string[] {
  if (!text) return [];
  const clean = text.replace(/https?:\/\/\S+/g, ' ').replace(/\b[\w-]+\.(?:com|io|dev|org|net|ai)\b\S*/g, ' ');
  const out = new Set<string>();
  for (const m of clean.matchAll(PATH_RE)) {
    const raw = m[1];
    if (/^\.\w+$/.test(raw) || raw.startsWith('.spec')) continue;
    const p = normalisePath(raw);
    if (!p || p.length > 160 || /^\d/.test(p)) continue;
    if (!p.includes('/') && !KNOWN_ROOT.test(p)) continue;
    out.add(p);
  }
  return [...out];
}

/** Map a mentioned path onto a known tree (exact, then suffix match). */
export function resolvePath(t: Territory, p: string): string | undefined {
  if (t.byPath[p]) return p;
  const tail = `/${p}`;
  let best: string | undefined;
  for (const f of t.files) if (f.endsWith(tail) && (!best || f.length < best.length)) best = f;
  if (best) return best;
  if (!p.includes('/')) return undefined;
  const base = p.split('/').slice(-2).join('/');
  return t.files.find((f) => f.endsWith(`/${base}`) || f === base);
}

// ---------------------------------------------------------------- palette

const PALETTE = ['#00e5ff', '#ffb428', '#3dff9a', '#ff5fd2', '#a98bff', '#c6ff4a', '#ff8a3d', '#4aa8ff'];
const FIXED: Record<string, string> = {
  'cursor-7': '#00e5ff',
  'codex-3': '#3dff9a',
  'claude-prime': '#ffb428',
  'scout-9': '#ff5fd2',
};
export function agentColor(id: string) {
  if (FIXED[id]) return FIXED[id];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** 1 = just touched, fades to a floor of 0.28 (explored but quiet). */
export function heat(at: number, now: number) {
  const age = (now - at) / 1000;
  return Math.max(0.28, 1 - age / 90);
}

export function repoKeyOf(url?: string) {
  if (!url) return 'unknown';
  return url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

export function repoLabel(url?: string) {
  const k = repoKeyOf(url);
  const parts = k.split('/');
  return parts.slice(-2).join('/').toUpperCase();
}

// ---------------------------------------------------------------- SECTOR 7G (simulated home repo)

const SPEC: Record<string, string[]> = {
  '.github/workflows': ['ci.yml', 'deploy.yml', 'nightly-e2e.yml', 'codeql.yml'],
  docs: ['architecture.md', 'mission-brief.md', 'getting-started.md', 'auth-flow.md', 'api-reference.md', 'runbook.md', 'adr-001-token-rotation.md', 'adr-002-vault.md', 'glossary.md'],
  infra: ['main.tf', 'variables.tf', 'outputs.tf', 'vault.tf', 'network.tf', 'k8s/deployment.yaml', 'k8s/service.yaml', 'k8s/ingress.yaml', 'k8s/configmap.yaml', 'docker/Dockerfile', 'docker/compose.yml'],
  scripts: ['bootstrap.sh', 'seed-db.ts', 'release.mjs', 'rotate-keys.sh', 'bench.ts', 'gen-types.ts'],
  'src/api': ['server.ts', 'router.ts', 'middleware/cors.ts', 'middleware/rate-limit.ts', 'middleware/request-id.ts', 'routes/admin.ts', 'routes/billing.ts', 'routes/health.ts', 'routes/agents.ts', 'routes/missions.ts', 'routes/telemetry.ts', 'routes/webhooks.ts', 'schema/agent.ts', 'schema/mission.ts', 'schema/billing.ts', 'errors.ts'],
  'src/auth': ['guard.ts', 'guard.spec.ts', 'session.ts', 'session.spec.ts', 'refresh.ts', 'refresh.spec.ts', 'scopes.ts', 'oauth/github.ts', 'oauth/google.ts', 'oauth/callback.ts', 'jwt.ts', 'jwt.spec.ts', 'permissions.ts', 'audit-log.ts'],
  'src/bridge': ['index.ts', 'uplink.ts', 'relay.ts', 'queue.ts', 'backpressure.ts', 'codec.ts', 'codec.spec.ts', 'heartbeat.ts', 'retry.ts', 'telemetry.ts'],
  'src/core': ['fleet.ts', 'scheduler.ts', 'scheduler.spec.ts', 'mission.ts', 'unit.ts', 'events.ts', 'clock.ts', 'config.ts', 'logger.ts', 'metrics.ts', 'priority-matrix.ts', 'rally-point.ts'],
  'src/harvest': ['cache.ts', 'cache.spec.ts', 'pipeline.ts', 'deps.ts', 'yield.ts', 'report.ts', 'sources/npm.ts', 'sources/pypi.ts', 'sources/git.ts'],
  'src/ui': ['App.tsx', 'main.tsx', 'theme.css', 'components/Roster.tsx', 'components/Map.tsx', 'components/Minimap.tsx', 'components/Cockpit.tsx', 'components/Terminal.tsx', 'components/CommandBar.tsx', 'components/NoticeBoard.tsx', 'hooks/useFleet.ts', 'hooks/useUplink.ts', 'hooks/useHotkeys.ts', 'styles/hud.css', 'styles/crt.css'],
  'src/vault': ['client.ts', 'handshake.ts', 'handshake.spec.ts', 'secrets.ts', 'lease.ts', 'policy.hcl', 'kms.ts'],
  tests: ['setup.ts', 'e2e/summon.spec.ts', 'e2e/assign.spec.ts', 'e2e/retreat.spec.ts', 'e2e/approve.spec.ts', 'e2e/uplink.spec.ts', 'integration/bridge.spec.ts', 'integration/vault.spec.ts', 'integration/billing.spec.ts', 'fixtures/agents.json', 'fixtures/missions.json', 'load/k6-fleet.js'],
  reports: ['deps-harvest.json', 'coverage-summary.json', 'perf-baseline.json'],
  '/': ['README.md', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts', '.env.example', 'AGENTS.md', 'CHANGELOG.md', 'LICENSE'],
};

export const SECTOR_LABELS: Record<string, string> = {
  '.github': 'SIGNAL ARRAY',
  docs: 'ARCHIVE NEBULA',
  infra: 'DRYDOCK',
  scripts: 'FORGE',
  'src/api': 'RELAY SPINE',
  'src/auth': 'AEGIS GATE',
  'src/bridge': 'DATA BRIDGE',
  'src/core': 'COMMAND CORE',
  'src/harvest': 'HARVEST FIELDS',
  'src/ui': 'LENS ARRAY',
  'src/vault': 'VAULT RIDGE',
  tests: 'PROVING GROUNDS',
  reports: 'INTEL DEPOT',
  '/': 'OUTPOST ROOT',
};

export const SECTOR_FILES: string[] = Object.entries(SPEC).flatMap(([dir, fs]) => fs.map((f) => (dir === '/' ? f : `${dir}/${f}`)));

export const HOME_KEY = 'sector-7g';
export const HOME_TERRITORY = buildTerritory(HOME_KEY, 'SECTOR 7G · ORION-CORE (SIMULATED)', SECTOR_FILES, { labels: SECTOR_LABELS });

/** Which district each simulated unit patrols. */
export const HOME_DISTRICT: Record<string, string[]> = {
  'cursor-7': ['src/auth', 'src/api'],
  'codex-3': ['src/harvest', 'reports', 'src/auth'],
  'claude-prime': ['src/core', 'docs', '.github'],
  'scout-9': ['src/vault', 'infra'],
  'probe-11': ['/', 'scripts', 'src/bridge'],
  'vector-2': ['src/bridge', 'src/api'],
  'relay-4': ['src/api', 'src/bridge'],
  'nova-6': ['tests'],
  'echo-12': ['docs', '/'],
};
