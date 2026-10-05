#!/usr/bin/env node
/**
 * Push a CURSOR-7 status update.
 *
 *   npm run cursor:push -- --state RUNNING --summary "Refactoring auth"
 *   node scripts/write-cursor-status.mjs FINISHED "PR opened"
 *   CURSOR_STATE=FAILED CURSOR_SUMMARY="Build broke" node scripts/write-cursor-status.mjs
 *
 * Fields (flag > positional > env > previous value):
 *   --state   / CURSOR_STATE      CREATING, RUNNING, FINISHED, FAILED, …
 *   --summary / CURSOR_SUMMARY
 *   --title   / CURSOR_TITLE
 *   --id      / CURSOR_AGENT_ID
 *   --url     / CURSOR_AGENT_URL
 *   --name    / CURSOR_NAME       board name (default CURSOR-7)
 * Target:
 *   --target public|bridge|both   (env CURSOR_LIVE_TARGET, default "both")
 *     public  -> public/cursor-live.json (what the app polls; also dist/ if built)
 *     bridge  -> .cursor-bridge/status.json (picked up by `npm run cursor:watch`)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BRIDGE_PATH, DEFAULTS, PUBLIC_PATH, atomicWrite, readJson, writeLive } from './lib/cursor-live.mjs';

const flags = {};
const positional = [];
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '-h' || a === '--help') {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
    process.exit(0);
  }
  if (a.startsWith('--')) {
    const [k, inline] = a.slice(2).split('=', 2);
    flags[k] = inline ?? argv[++i];
  } else positional.push(a);
}

const target = String(flags.target ?? process.env.CURSOR_LIVE_TARGET ?? 'both').toLowerCase();
if (!['public', 'bridge', 'both'].includes(target)) {
  console.error(`invalid --target "${target}" (public|bridge|both)`);
  process.exit(2);
}

const prev = readJson(PUBLIC_PATH) ?? readJson(BRIDGE_PATH) ?? {};
const pick = (key, env, pos) => flags[key] ?? pos ?? process.env[env] ?? prev[key] ?? DEFAULTS[key];

const id = String(pick('id', 'CURSOR_AGENT_ID'));
const out = {
  id,
  name: String(pick('name', 'CURSOR_NAME')),
  title: String(pick('title', 'CURSOR_TITLE')),
  state: String(pick('state', 'CURSOR_STATE', positional[0])).toUpperCase(),
  url: String(
    flags.url ?? process.env.CURSOR_AGENT_URL ?? (prev.id === id && prev.url ? prev.url : `https://cursor.com/agents/${id}`),
  ),
  updatedAt: new Date().toISOString(),
  summary: String(pick('summary', 'CURSOR_SUMMARY', positional[1])),
};

if (target !== 'public') atomicWrite(BRIDGE_PATH, out);
if (target !== 'bridge') writeLive(out);
console.log(`[cursor:push] target=${target}\n${JSON.stringify(out, null, 2)}`);
