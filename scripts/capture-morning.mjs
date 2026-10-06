#!/usr/bin/env node
/**
 * Headless recon photography: screenshots + a silent video of the ?demo=1 replay.
 *
 *   npm i --no-save playwright        # once (uses your installed Chrome)
 *   node scripts/capture-morning.mjs [baseUrl] [--no-video]
 *
 * Safety: every non-GET request to /api/agents is answered inside the browser with 418,
 * so this script can never launch, follow up or stop a real cloud agent.
 */
import { chromium } from 'playwright';
import { existsSync, renameSync, rmSync, mkdirSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const base = (process.argv.find((a) => a.startsWith('http')) ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
const video = !process.argv.includes('--no-video');
const out = (f) => path.resolve(process.cwd(), f);
const chrome = ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find((p) => existsSync(p));
const VIEW = { width: 1600, height: 900 };

const browser = await chromium.launch({ ...(chrome ? { executablePath: chrome } : {}), args: ['--autoplay-policy=no-user-gesture-required'] });

async function guarded(ctx) {
  await ctx.route(/\/api\/agents/, (route) =>
    route.request().method() === 'GET'
      ? route.continue()
      : route.fulfill({ status: 418, contentType: 'application/json', body: '{"error":"blocked by capture script","code":"CAPTURE_GUARD"}' }),
  );
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) live HUD + territory + war room
{
  const ctx = await browser.newContext({ viewport: VIEW });
  await guarded(ctx);
  const page = await ctx.newPage();
  await page.goto(`${base}/`);
  await wait(14000);
  await page.screenshot({ path: out('morning-hud.png') });
  await page.click('.archive-tray__head');
  await wait(600);
  await page.screenshot({ path: out('morning-archive-tray.png') });
  await page.keyboard.press('t');
  await wait(1500);
  await page.screenshot({ path: out('morning-territory-live.png') });
  await page.keyboard.press('Escape');
  await page.keyboard.press('w');
  await wait(1200);
  await page.screenshot({ path: out('morning-war-room-live.png') });
  await ctx.close();
  console.log('live HUD captured');
}

// 2) demo replay: stills at key beats (+ optional video of the full run)
{
  const vdir = out('.capture-video');
  if (video) mkdirSync(vdir, { recursive: true });
  const ctx = await browser.newContext({ viewport: VIEW, ...(video ? { recordVideo: { dir: vdir, size: VIEW } } : {}) });
  await guarded(ctx);
  const page = await ctx.newPage();
  const t0 = Date.now();
  await page.goto(`${base}/?demo=1`);
  const at = async (sec, file) => {
    const ms = 5200 + sec * 1000 - (Date.now() - t0); // 5s standby countdown before T+0
    if (ms > 0) await wait(ms);
    await page.screenshot({ path: out(file) });
  };
  await at(-3, 'morning-demo-title.png');
  await at(18, 'morning-demo-cockpit.png');
  await at(23, 'morning-demo-alert.png');
  await at(31, 'morning-fog-of-war.png');
  await at(39, 'morning-demo-mid.png');
  await at(45, 'morning-war-room.png');
  await at(63, 'morning-demo-end.png');
  const v = page.video();
  await ctx.close();
  if (v) {
    const src = await v.path();
    const webm = out('morning-demo.webm');
    rmSync(webm, { force: true });
    renameSync(src, webm);
    try {
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out('morning-demo.mp4')]);
    } catch {
      console.log('ffmpeg not available: webm only');
    }
    for (const f of readdirSync(vdir)) rmSync(path.join(vdir, f), { force: true });
    rmSync(vdir, { recursive: true, force: true });
  }
  console.log('demo captured');
}

await browser.close();
