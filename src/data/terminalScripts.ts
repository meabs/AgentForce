import type { TermKind } from '../types';

/**
 * Fake-but-plausible tool-call transcripts per agent. Prefix sets the line kind:
 *   "$ " cmd · "→ " tool · "● " think · "✓ " ok · "⚠ " warn · "✗ " err · otherwise out
 */
export const RUN_SCRIPTS: Record<string, string[]> = {
  'cursor-7': [
    '● Plan: locate permission checks, then trace request path',
    '$ rg -n "requirePermission" src --type ts',
    'src/auth/guard.ts:42:export function requirePermission(scope: Scope) {',
    'src/routes/admin.ts:17:  router.use(requirePermission("admin:write"));',
    'src/routes/billing.ts:9:  requirePermission("billing:read"),',
    '→ read_file src/auth/guard.ts (188 lines)',
    '● guard runs before session hydrate; scope list is empty on cold start',
    '$ find src -name "*.spec.ts" -path "*auth*"',
    'src/auth/guard.spec.ts',
    'src/auth/session.spec.ts',
    '→ edit src/auth/guard.ts  +12 −4',
    '$ npx vitest run src/auth',
    '✓ guard.spec.ts (14 tests) 412ms',
    '✓ session.spec.ts (9 tests) 288ms',
    '● next: request permission for admin scope on staging',
  ],
  'codex-3': [
    '● Harvesting dependency intel for data bridge',
    '$ npm ls --all --json | jq ".dependencies | keys | length"',
    '214',
    '→ read_file package-lock.json (offset 0, 400 lines)',
    '$ npx depcheck --json',
    '⚠ unused: left-pad, moment-timezone',
    '→ write_file reports/deps-harvest.json (3.1 KB)',
    '$ git diff --stat',
    ' reports/deps-harvest.json | 118 +++++++++',
    ' 1 file changed, 118 insertions(+)',
    '● drafting unit test stubs for token refresh',
    '→ edit src/auth/refresh.spec.ts  +46',
    '$ npx tsc --noEmit -p .',
    '✓ typecheck clean (0 errors)',
  ],
  'claude-prime': [
    '● Rebalancing fleet priorities',
    '→ fleet.status() → 4 units · 2 running · 1 idle · 1 blocked',
    '● SCOUT-9 blocked on credential gate; escalate or reroute?',
    '→ fleet.reassign(SCOUT-9 → "Perimeter Sweep (read-only)")',
    '⚠ reassign deferred: awaiting commander approval',
    '→ read_file docs/mission-brief.md (64 lines)',
    '● bridge phase 2 needs CODEX-3 harvest report first',
    '→ fleet.broadcast("phase 2 gated on deps-harvest.json")',
    '✓ broadcast ack from 3/4 units',
    '● reviewing blocked-agent queue',
  ],
  'scout-9': [
    '$ vault read secret/staging/probe-token',
    '✗ permission denied (403): policy "probe-ro" lacks read on secret/staging/*',
    '● retrying with backoff (attempt 2/5)',
    '$ vault read secret/staging/probe-token',
    '✗ permission denied (403)',
    '⚠ holding position at sector edge',
    '→ request_access(scope="secret/staging/probe-token", reason="perimeter sweep")',
    '● awaiting approval from commander…',
    '$ curl -sI https://probe.internal/healthz',
    '⚠ 429 Too Many Requests · retry-after: 30',
  ],
};

export const GENERIC_SCRIPT = [
  '● Booting fresh unit; reading task brief',
  '$ ls -la',
  'drwxr-xr-x  src/  scripts/  public/  package.json  README.md',
  '→ read_file README.md (210 lines)',
  '$ git status --short',
  ' M src/App.tsx',
  '● drafting execution plan',
  '$ npm run build --silent',
  '✓ build ok (172ms)',
];

export const IDLE_LINES = [
  '· heartbeat ok · awaiting orders',
  '· standing by on secure channel',
  '· idle · telemetry nominal',
];

export const MISSION_PICKS = [
  'Permission Request',
  'Data Harvest',
  'Fleet Coordination',
  'Perimeter Sweep',
  'Refactor Auth Module',
  'Fix Flaky Tests',
  'Dependency Audit',
  'Write Release Notes',
  'Establish Data Bridge',
];

export function kindOf(line: string): { kind: TermKind; text: string } {
  const map: Array<[string, TermKind]> = [
    ['$ ', 'cmd'],
    ['→ ', 'tool'],
    ['● ', 'think'],
    ['✓ ', 'ok'],
    ['⚠ ', 'warn'],
    ['✗ ', 'err'],
  ];
  for (const [p, kind] of map) if (line.startsWith(p)) return { kind, text: line.slice(p.length) };
  return { kind: 'out', text: line };
}
