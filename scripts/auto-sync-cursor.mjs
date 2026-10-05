#!/usr/bin/env node
/**
 * Auto-sync CURSOR-7 live status into public/cursor-live.json.
 *
 *   npm run cursor:watch            # loop forever (default every 3s)
 *   npm run cursor:sync             # one-shot
 *
 * Source (first that applies, each tick):
 *   1. CURSOR_STATUS_CMD  shell command whose stdout is JSON (e.g. a future CLI / curl to a
 *                         local bridge). Fields: state|status, summary|activity, title, id, url.
 *   2. Bridge file        CURSOR_BRIDGE_PATH / AGENT_STATUS_PATH, else .cursor-bridge/status.json
 *   3. /tmp/cursor-agent-status.json (legacy drop location)
 *
 * Only writes when content changes (ignoring updatedAt) or the source's updatedAt advances.
 * Options: --once, --interval <sec> (env CURSOR_SYNC_INTERVAL), --quiet
 * Never calls any Cursor API itself and needs no credentials.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { BRIDGE_PATH, PUBLIC_PATH, normalize, readJson, sameContent, writeLive } from './lib/cursor-live.mjs';

const args = process.argv.slice(2);
const once = args.includes('--once');
const quiet = args.includes('--quiet');
const ivIdx = args.indexOf('--interval');
const intervalSec = Number(ivIdx >= 0 ? args[ivIdx + 1] : process.env.CURSOR_SYNC_INTERVAL || 3);
const LEGACY = '/tmp/cursor-agent-status.json';

const log = (...m) => {
  if (!quiet) console.log(`[cursor:watch ${new Date().toLocaleTimeString('en-GB')}]`, ...m);
};

function readSource() {
  const cmd = process.env.CURSOR_STATUS_CMD;
  if (cmd) {
    try {
      const outText = execSync(cmd, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
      return { from: `cmd`, data: JSON.parse(outText) };
    } catch (e) {
      log('CURSOR_STATUS_CMD failed:', e.message.split('\n')[0]);
      return null;
    }
  }
  for (const p of [BRIDGE_PATH, LEGACY]) {
    if (existsSync(p)) {
      const data = readJson(p);
      if (data) return { from: p, data };
      log(`unreadable JSON at ${p}`);
    }
  }
  return null;
}

let lastSourceStamp = null;

function tick() {
  const src = readSource();
  if (!src) return false;
  const prev = readJson(PUBLIC_PATH) ?? {};
  const next = normalize(src.data, prev);
  const stamp = `${next.updatedAt}|${JSON.stringify({ ...next, updatedAt: '' })}`;
  if (stamp === lastSourceStamp) return false;
  lastSourceStamp = stamp;
  const srcHasStamp = Boolean(src.data?.updatedAt ?? src.data?.updated_at ?? src.data?.agent?.updatedAt);
  if (sameContent(prev, next) && (!srcHasStamp || prev.updatedAt === next.updatedAt)) return false;
  writeLive(next);
  log(`synced from ${src.from}: ${next.state} — ${next.summary}`);
  return true;
}

if (once) {
  const changed = tick();
  if (!changed) log('no change');
  process.exit(0);
}

log(`watching every ${intervalSec}s → ${PUBLIC_PATH}`);
log(process.env.CURSOR_STATUS_CMD ? `source: CURSOR_STATUS_CMD` : `source: ${BRIDGE_PATH} (fallback ${LEGACY})`);
tick();
const t = setInterval(tick, Math.max(1, intervalSec) * 1000);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (clearInterval(t), log('stopped'), process.exit(0)));
