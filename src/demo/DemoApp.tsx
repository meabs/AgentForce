import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MissionBanner } from '../components/MissionBanner';
import { AgentList } from '../components/AgentList';
import { ActivityFeed } from '../components/ActivityFeed';
import { Map, project } from '../components/Map';
import { Minimap } from '../components/Minimap';
import { MissionStatus } from '../components/MissionStatus';
import { NoticeBoard } from '../components/NoticeBoard';
import { CommandBar, type CommandId } from '../components/CommandBar';
import { Cockpit } from '../components/Cockpit';
import { BurnMeter, rateOf, USD_PER_MTOK } from '../components/BurnMeter';
import { HudToolbar } from '../components/HudToolbar';
import { TerritoryOverlay } from '../components/TerritoryOverlay';
import { WarRoom } from '../components/WarRoom';
import type { ArchivedUnit } from '../components/ArchiveTray';
import { useTerritoryState } from '../hooks/useTerritory';
import { useRunHistory } from '../hooks/useRunHistory';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import { HOME_KEY, HOME_TERRITORY } from '../lib/territory';
import { say, sfx, spoken, toggleAmbient, toggleMuted, unlock, VOICE } from '../lib/sfx';
import type { ActivityEntry, Agent, TermKind, TermLine } from '../types';
import '../App.css';
import './demo.css';

export const DEMO_LENGTH_MS = 60_000;
const BURN_SPEED = 2;
const REPLAY_UPLINK: UplinkInfo = { phase: 'online', apiVersion: 'replay' };

// ---------------------------------------------------------------- deterministic randomness

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- world model

interface Explorer {
  pool: string[];
  i: number;
  every: number;
  last: number;
  lines: string[];
  li: number;
}

interface Caption {
  title: string;
  sub?: string;
  tone: 'cyan' | 'amber' | 'green' | 'red';
  key: number;
}

interface World {
  agents: Agent[];
  feed: ActivityEntry[];
  logs: Record<string, TermLine[]>;
  selectedId: string | null;
  cockpitId: string | null;
  cam: { follow?: string; x: number; y: number; z: number };
  caption: Caption | null;
  toast: { text: string; tone: 'amber' | 'green' | 'red' } | null;
  pulse: CommandId | null;
  territoryOpen: boolean;
  warRoomOpen: boolean;
  objectives: Array<{ text: string; state: 'done' | 'active' | 'todo' }>;
  notices: Array<{ t: string; msg: string }>;
  bursts: Record<string, 'done' | 'alert'>;
  archived: ArchivedUnit[];
  departing: Set<string>;
  arriving: Set<string>;
  explorers: Record<string, Explorer>;
  pointer: { x: number; y: number; click: number } | null;
  tokens: number;
  interventions: number;
  ended: boolean;
  missionLabel: string;
}

const OBJECTIVES = ['Summon strike team', 'Refactor data bridge codec', 'Clear the e2e blocker', 'Chart the repo territory', 'Ship PR for review'];

function freshWorld(): World {
  return {
    agents: [
      {
        id: 'claude-prime',
        name: 'CLAUDE-PRIME',
        mission: 'Fleet Coordination',
        status: 'IDLE',
        activity: 'Awaiting commander…',
        progress: 0,
        classLabel: 'COMMAND',
        role: 'Lead',
        hp: 100,
        tokens: 92,
        x: 48,
        y: 48,
      },
    ],
    feed: [],
    logs: {},
    selectedId: 'claude-prime',
    cockpitId: null,
    cam: { x: 50, y: 50, z: 1.18 },
    caption: null,
    toast: null,
    pulse: null,
    territoryOpen: false,
    warRoomOpen: false,
    objectives: OBJECTIVES.map((text) => ({ text, state: 'todo' as const })),
    notices: [],
    bursts: {},
    archived: [],
    departing: new Set(),
    arriving: new Set(),
    explorers: {},
    pointer: null,
    tokens: 0,
    interventions: 0,
    ended: false,
    missionLabel: 'STANDBY',
  };
}

const files = HOME_TERRITORY.files;
const inDirs = (dirs: string[]) => files.filter((f) => dirs.includes(HOME_TERRITORY.byPath[f].dir));

// Flavour lines streamed into terminals between file touches.
const FLAVOUR: Record<string, string[]> = {
  'vector-2': [
    '● Plan: split codec into frame + payload layers, keep wire format stable',
    '$ rg -n "encodeFrame" src --type ts',
    '● backpressure path allocates per frame: pool the buffers',
    '$ npx vitest run src/bridge',
    '✓ codec.spec.ts (22 tests) 318ms',
    '● throughput +41% on the relay benchmark',
    '$ git checkout -b feat/bridge-codec-v2',
    '✓ typecheck clean (0 errors)',
  ],
  'nova-6': [
    '● Plan: stabilise e2e suite, then add uplink coverage',
    '$ npx playwright test tests/e2e --reporter=line',
    '⚠ summon.spec.ts flaky: 2 of 5 runs timed out',
    '● root cause: warp animation not awaited before click',
    '$ npx playwright test --repeat-each=10',
    '✓ 50 passed (41.2s)',
  ],
  'echo-12': [
    '● Plan: rewrite getting started for a five minute first run',
    '$ wc -w docs/getting-started.md',
    '1874 docs/getting-started.md',
    '● cutting to 640 words, adding a copy paste quickstart',
    '✓ links checked: 0 broken',
  ],
  'probe-11': [
    '● Recon sweep: index every module, map imports',
    '$ git ls-files | wc -l',
    `${files.length}`,
    '● building dependency graph for the fleet',
    '✓ graph: 0 cycles, 3 orphan modules flagged',
  ],
  'claude-prime': ['● Rebalancing priorities across the strike team', '● NOVA-6 blocker escalated to commander', '✓ fleet status broadcast'],
};

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

let lineSeq = 0;

// ---------------------------------------------------------------- component

export default function DemoApp({ onExit: exitProp }: { onExit?: () => void }) {
  const canExit = !!exitProp;
  const onExit = useCallback(() => exitProp?.(), [exitProp]);
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const loop = params.get('loop') === '1' || (!canExit && params.get('loop') !== '0');
  // In-app replay (?demo=1) auto-engages after a countdown (headless capture, kiosk loops).
  // The standalone build (GitHub Pages) waits for an ENGAGE click so audio can unlock on that gesture;
  // ?autostart=1 opts back in there.
  const autostart = canExit ? params.get('autostart') !== '0' : params.get('autostart') === '1';
  const [phase, setPhase] = useState<'standby' | 'playing' | 'ended'>('standby');
  const [countdown, setCountdown] = useState(5);
  const [, setFrame] = useState(0);
  const [runKey, setRunKey] = useState(0);
  const [paused, setPaused] = useState(false);
  const world = useRef<World>(freshWorld());
  const elapsedRef = useRef(0);
  const terr = useTerritoryState({ revealSound: true });
  const touchRef = useRef(terr.touch);
  touchRef.current = terr.touch;
  const bump = useCallback(() => setFrame((f) => f + 1), []);
  const W = world.current;

  // ---------- world helpers ----------
  const helpers = useMemo(() => {
    const w = () => world.current;
    const find = (id: string) => w().agents.find((a) => a.id === id);
    const patch = (id: string, p: Partial<Agent>) => {
      w().agents = w().agents.map((a) => (a.id === id ? { ...a, ...p } : a));
    };
    const log = (id: string, kind: TermKind, text: string) => {
      const l = w().logs;
      l[id] = [...(l[id] ?? []), { id: `dl-${++lineSeq}`, t: Date.now(), kind, text }].slice(-120);
    };
    const feed = (agentName: string, message: string, kind: ActivityEntry['kind'] = 'info') => {
      w().feed = [{ id: `df-${++lineSeq}`, timestamp: Date.now(), agentName, message, kind }, ...w().feed].slice(0, 40);
    };
    const notice = (msg: string) => {
      w().notices = [{ t: `T+${clock(elapsedRef.current)}`, msg }, ...w().notices].slice(0, 9);
    };
    const caption = (title: string, sub?: string, tone: Caption['tone'] = 'cyan') => {
      w().caption = { title, sub, tone, key: ++lineSeq };
    };
    const toast = (text: string, tone: 'amber' | 'green' | 'red' = 'amber') => {
      w().toast = { text, tone };
      const k = text;
      window.setTimeout(() => {
        if (w().toast?.text === k) w().toast = null;
      }, 2600);
    };
    const press = (cmd: CommandId) => {
      w().pulse = cmd;
      window.setTimeout(() => {
        if (w().pulse === cmd) w().pulse = null;
      }, 450);
    };
    const objective = (i: number, state: 'done' | 'active' | 'todo') => {
      w().objectives = w().objectives.map((o, k) => (k === i ? { ...o, state } : o));
    };
    const point = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) return;
      const r = el.getBoundingClientRect();
      w().pointer = { x: r.left + r.width / 2, y: r.top + r.height / 2, click: w().pointer?.click ?? 0 };
    };
    const click = () => {
      if (w().pointer) w().pointer = { ...w().pointer!, click: w().pointer!.click + 1 };
    };
    const burst = (id: string, kind: 'done' | 'alert') => {
      w().bursts = { ...w().bursts, [id]: kind };
      window.setTimeout(() => {
        const b = { ...w().bursts };
        delete b[id];
        w().bursts = b;
      }, 3400);
    };
    const summon = (id: string, name: string, classLabel: string, role: string, at: { x: number; y: number }) => {
      const a: Agent = { id, name, mission: 'Awaiting Orders', status: 'IDLE', activity: 'Warping in…', progress: 4, classLabel, role, hp: 100, tokens: 100, x: at.x, y: at.y };
      w().agents = [...w().agents, a];
      w().arriving = new Set([id]);
      w().selectedId = id;
      window.setTimeout(() => {
        if (w().arriving.has(id)) w().arriving = new Set();
      }, 1400);
      log(id, 'sys', `${name} materialised at (${at.x.toFixed(0)}, ${at.y.toFixed(0)}) · systems online`);
      feed(name, 'SUMMONED to sector 7G', 'ok');
      notice(`OPS: ${name} joined the strike team`);
      toast(`＋ SUMMONED ${name}`, 'green');
      sfx.warp();
      window.setTimeout(() => say(`${spoken(name)}. ${VOICE.ready}`), 450);
    };
    const assign = (id: string, mission: string, dirs: string[], every: number, opts: { sweep?: boolean; voice?: boolean } = {}) => {
      const a = find(id);
      if (!a) return;
      patch(id, { mission, status: 'RUNNING', activity: 'Orders received · moving out' });
      const pool = opts.sweep ? files.slice() : inDirs(dirs);
      w().explorers[id] = { pool, i: 0, every, last: elapsedRef.current, lines: FLAVOUR[id] ?? [], li: 0 };
      log(id, 'tool', `fleet.assign(${a.name}, "${mission}")`);
      log(id, 'ok', `mission accepted: ${mission}`);
      feed(a.name, `assigned mission: ${mission}`, 'info');
      toast(`⌖ ${a.name} → ${mission.toUpperCase()}`);
      sfx.ack();
      if (opts.voice !== false) window.setTimeout(() => say(VOICE.orders), 250);
    };
    const finish = (id: string, summary: string, pr?: string) => {
      const a = find(id);
      if (!a) return;
      delete w().explorers[id];
      patch(id, { status: 'IDLE', progress: 100, activity: summary });
      log(id, 'ok', `✓ mission complete · ${summary}`);
      if (pr) log(id, 'ok', `PR ready · ${pr}`);
      feed(a.name, `MISSION COMPLETE · ${summary}`, 'ok');
      notice(`OPS: ${a.name} mission complete${pr ? ` · ${pr}` : ''}`);
      toast(`✓ ${a.name} · MISSION COMPLETE`, 'green');
      burst(id, 'done');
      sfx.fanfare();
      window.setTimeout(() => say(`${spoken(a.name)}. ${VOICE.complete}`, { force: true }), 950);
    };
    const archive = (id: string) => {
      w().departing = new Set([...w().departing, id]);
      window.setTimeout(() => {
        const a = find(id);
        if (!a) return;
        w().agents = w().agents.filter((x) => x.id !== id);
        w().departing.delete(id);
        w().archived = [
          { id, name: a.name, mission: a.mission, rawStatus: 'FINISHED', finishedAt: Date.now(), real: false, summary: a.activity },
          ...w().archived,
        ];
        feed(a.name, 'docked in the archive tray', 'info');
        sfx.tick();
      }, 1300);
    };
    return { find, patch, log, feed, notice, caption, toast, press, objective, point, click, burst, summon, assign, finish, archive };
  }, []);

  // ---------- the script ----------
  const cues = useMemo(() => {
    const h = helpers;
    const w = () => world.current;
    const C: Array<[number, () => void]> = [
      [0, () => {
        sfx.boot();
        w().missionLabel = 'MISSION REPLAY';
        h.caption('AGENT FLEET COMMAND', 'MISSION REPLAY · OP-0417 · ESTABLISH DATA BRIDGE', 'cyan');
      }],
      [1800, () => say(VOICE.online, { force: true })],
      [4000, () => {
        h.caption('T+04 · OPERATION 0417 BEGINS', 'One objective: ship the data bridge. Four agents. Sixty seconds.', 'amber');
        w().cam = { x: 50, y: 50, z: 1.12 };
        h.objective(0, 'active');
        h.notice('OPS: Operation 0417 authorised');
      }],
      [5000, () => h.point('[data-cmd="summon"]')],
      [5600, () => {
        h.click();
        h.press('summon');
        h.summon('vector-2', 'VECTOR-2', 'SYNTH', 'Build', { x: 56, y: 42 });
      }],
      [6900, () => h.point('[data-cmd="assign"]')],
      [7400, () => {
        h.click();
        h.press('assign');
        h.assign('vector-2', 'Refactor data bridge codec', ['src/bridge', 'src/api'], 520);
        w().cam = { follow: 'vector-2', x: 50, y: 50, z: 1.3 };
      }],
      [8800, () => h.point('[data-cmd="summon"]')],
      [9200, () => {
        h.click();
        h.press('summon');
        h.summon('nova-6', 'NOVA-6', 'SCOUT', 'Tests', { x: 40, y: 56 });
      }],
      [10000, () => h.assign('nova-6', 'Harden the e2e suite', ['tests'], 560, { voice: false })],
      [10700, () => {
        h.press('summon');
        h.summon('echo-12', 'ECHO-12', 'SYNTH', 'Docs', { x: 58, y: 58 });
      }],
      [11400, () => h.assign('echo-12', 'Rewrite the getting started guide', ['docs', '/'], 640, { voice: false })],
      [12300, () => {
        h.press('summon');
        h.summon('probe-11', 'PROBE-11', 'PROBE', 'Recon', { x: 38, y: 40 });
        h.objective(0, 'done');
        h.objective(1, 'active');
        h.objective(3, 'active');
      }],
      [13000, () => {
        h.assign('probe-11', 'Recon the full repository', [], 300, { sweep: true, voice: false });
        h.caption('PROBE-11 SWEEPS THE SECTOR', 'Fog lifts as agents read files. Every tile on the map is a file in the repo.', 'cyan');
        w().cam = { x: 50, y: 50, z: 1.08 };
      }],
      [14000, () => h.assign('claude-prime', 'Fleet coordination', ['src/core', '.github'], 1400, { voice: false })],
      [15400, () => h.point('.agent-list__items li:nth-child(2) .agent-card')],
      [15900, () => {
        h.click();
        sfx.select();
        w().selectedId = 'vector-2';
        w().cockpitId = 'vector-2';
        w().cam = { follow: 'vector-2', x: 50, y: 50, z: 1.5 };
        h.caption('COCKPIT LINK · VECTOR-2', 'Live terminal stream: every tool call, every file, as it happens.', 'cyan');
        w().pointer = null;
      }],
      [21600, () => {
        w().cockpitId = null;
        h.patch('nova-6', { status: 'BLOCKED', activity: 'Blocked: flaky e2e suite needs a decision', hp: 64 });
        delete w().explorers['nova-6'];
        h.log('nova-6', 'err', '✗ summon.spec.ts timed out (3 of 5 runs)');
        h.log('nova-6', 'warn', 'awaiting commander: quarantine flaky spec and add retry guard?');
        h.feed('NOVA-6', 'BLOCKED · flaky e2e suite needs approval', 'warn');
        h.notice('WARN: NOVA-6 blocked on flaky e2e suite');
        h.toast('⚠ NOVA-6 BLOCKED · AWAITING COMMANDER', 'red');
        h.burst('nova-6', 'alert');
        h.objective(2, 'active');
        h.caption('ALERT · NOVA-6 BLOCKED', "Flaky end to end suite. The agent needs a commander's call.", 'red');
        w().cam = { follow: 'nova-6', x: 50, y: 50, z: 1.45 };
        w().selectedId = 'nova-6';
        sfx.klaxon();
        window.setTimeout(() => say(VOICE.alert, { force: true }), 900);
      }],
      [24300, () => h.point('[data-cmd="approve"]')],
      [24900, () => {
        h.click();
        h.press('approve');
        w().interventions += 1;
        h.patch('nova-6', { status: 'RUNNING', activity: 'Plan approved · quarantining flaky spec', hp: 90 });
        w().explorers['nova-6'] = { pool: inDirs(['tests', 'src/ui']), i: 6, every: 480, last: elapsedRef.current, lines: FLAVOUR['nova-6'].slice(3), li: 0 };
        h.log('nova-6', 'ok', 'PLAN APPROVED by commander · block cleared → RUNNING');
        h.feed('NOVA-6', 'plan APPROVED · unblocked', 'ok');
        h.toast('✓ PLAN APPROVED → NOVA-6 · ACK', 'green');
        h.caption('PLAN APPROVED', 'One keypress. The unit is back in the fight.', 'green');
        sfx.ack();
        window.setTimeout(() => say(VOICE.approved, { force: true }), 200);
      }],
      [26600, () => {
        w().pointer = null;
        w().territoryOpen = true;
        sfx.tick();
        h.caption('TERRITORY · FOG OF WAR', 'Lit tiles were touched by an agent. White cores mark edits. Watch the sweep.', 'cyan');
      }],
      [33200, () => {
        w().territoryOpen = false;
        h.finish('echo-12', 'Guide rewritten · 640 words, quickstart added');
        w().cam = { follow: 'echo-12', x: 50, y: 50, z: 1.35 };
        h.caption('ECHO-12 · MISSION COMPLETE', 'Docs shipped. Finished units dock in the archive tray.', 'green');
      }],
      [36200, () => h.archive('echo-12')],
      [37800, () => {
        h.finish('vector-2', 'Codec v2 · throughput +41%', 'PR #418');
        h.objective(1, 'done');
        h.objective(4, 'done');
        w().cam = { follow: 'vector-2', x: 50, y: 50, z: 1.35 };
        h.caption('PR #418 READY FOR REVIEW', 'VECTOR-2 refactored the data bridge codec. Tests green.', 'green');
      }],
      [40600, () => h.archive('vector-2')],
      [41400, () => {
        w().warRoomOpen = true;
        sfx.tick();
        h.caption('WAR ROOM', 'Every unit, every state change, one timeline. Red is where humans were needed.', 'amber');
      }],
      [47000, () => {
        w().warRoomOpen = false;
        h.finish('probe-11', 'Recon complete · repo charted');
        h.objective(3, 'done');
        w().cam = { x: 50, y: 50, z: 1.12 };
      }],
      [48600, () => {
        h.finish('nova-6', 'E2E suite green · 50 of 50');
        h.objective(2, 'done');
      }],
      [49800, () => {
        h.archive('probe-11');
        h.archive('nova-6');
      }],
      [50600, () => {
        h.patch('claude-prime', { status: 'IDLE', progress: 100, activity: 'Fleet standing down' });
        delete w().explorers['claude-prime'];
        w().missionLabel = 'MISSION COMPLETE';
        w().cam = { x: 50, y: 50, z: 1.02 };
        h.caption('ALL OBJECTIVES COMPLETE', undefined, 'green');
      }],
      [51600, () => say(`${VOICE.complete} ${VOICE.allHome}`, { force: true })],
      [53500, () => {
        w().caption = null;
        w().ended = true;
      }],
    ];
    return C.sort((a, b) => a[0] - b[0]);
  }, [helpers]);

  // ---------- clock ----------
  const reset = useCallback(() => {
    world.current = freshWorld();
    elapsedRef.current = 0;
    terr.reset();
    setRunKey((k) => k + 1);
    setPaused(false);
  }, [terr]);

  const engage = useCallback(() => {
    unlock();
    reset();
    setPhase('playing');
  }, [reset]);

  // standby countdown (auto-engage so headless capture and kiosk loops just work)
  useEffect(() => {
    if (phase !== 'standby' || !autostart) return;
    setCountdown(5);
    const t = window.setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearInterval(t);
  }, [phase, autostart]);
  useEffect(() => {
    if (phase === 'standby' && autostart && countdown <= 0) engage();
  }, [countdown, phase, autostart, engage]);

  useEffect(() => {
    if (phase !== 'playing' || paused) return;
    const fired = new Set<number>();
    cues.forEach(([at], i) => at < elapsedRef.current && fired.add(i));
    let last = performance.now();
    const rand = rng(417 + runKey);
    const timer = window.setInterval(() => {
      const nowP = performance.now();
      const dt = Math.min(250, nowP - last);
      last = nowP;
      elapsedRef.current += dt;
      const t = elapsedRef.current;
      const w = world.current;
      cues.forEach(([at, fn], i) => {
        if (!fired.has(i) && at <= t) {
          fired.add(i);
          fn();
        }
      });
      // explorers: running units read / edit their next file
      for (const [id, ex] of Object.entries(w.explorers)) {
        const a = w.agents.find((x) => x.id === id);
        if (!a || a.status !== 'RUNNING' || t - ex.last < ex.every) continue;
        ex.last = t;
        const path = ex.pool[ex.i % ex.pool.length];
        ex.i += 1;
        const edit = id !== 'probe-11' && rand() < 0.35;
        touchRef.current(HOME_KEY, [path], a, edit ? 'edit' : 'read');
        const lines = w.logs[id] ?? [];
        const mk = (kind: TermKind, text: string) => ({ id: `dl-${++lineSeq}`, t: Date.now(), kind, text });
        const add: TermLine[] = [mk('tool', edit ? `edit ${path}  +${2 + Math.floor(rand() * 30)} −${Math.floor(rand() * 9)}` : `read_file ${path}`)];
        if (ex.lines.length && rand() < 0.45) {
          const raw = ex.lines[ex.li % ex.lines.length];
          ex.li += 1;
          const kind: TermKind = raw.startsWith('$ ') ? 'cmd' : raw.startsWith('● ') ? 'think' : raw.startsWith('✓ ') ? 'ok' : raw.startsWith('⚠ ') ? 'warn' : 'out';
          add.push(mk(kind, raw.replace(/^[$●✓⚠] /, '')));
        }
        w.logs[id] = [...lines, ...add].slice(-120);
        const prog = Math.min(94, a.progress + (id === 'probe-11' ? 0.7 : 3 + rand() * 3));
        w.agents = w.agents.map((x) => (x.id === id ? { ...x, progress: Math.round(prog), activity: `${edit ? 'Editing' : 'Reading'} ${path}`, tokens: Math.max(18, x.tokens - 0.4) } : x));
        if (edit && rand() < 0.4) {
          w.feed = [{ id: `df-${++lineSeq}`, timestamp: Date.now(), agentName: a.name, message: `edited ${path}`, kind: 'info' as const }, ...w.feed].slice(0, 40);
        }
      }
      // token burn (same model as the meter, so the end card matches)
      for (const a of w.agents) if (a.status === 'RUNNING') w.tokens += (rateOf(a.id) * BURN_SPEED * dt) / 1000;
      if (w.ended && t >= DEMO_LENGTH_MS - 6500) {
        setPhase('ended');
      }
      bump();
    }, 100);
    return () => window.clearInterval(timer);
  }, [phase, paused, cues, bump, runKey]);

  // loop mode: restart after the end card has been up for a while
  useEffect(() => {
    if (phase !== 'ended' || !loop) return;
    const t = window.setTimeout(() => engage(), 9000);
    return () => window.clearTimeout(t);
  }, [phase, loop, engage]);

  // keyboard: space pause, R restart, Esc exit, M mute, B bridge hum, Enter engage
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'm') return toggleMuted();
      if (k === 'b') return toggleAmbient();
      if (k === 'escape' && !world.current.territoryOpen && !world.current.warRoomOpen) return onExit();
      if (k === 'r') return engage();
      if ((k === 'enter' || k === ' ') && phase !== 'playing') {
        e.preventDefault();
        return engage();
      }
      if (k === ' ' && phase === 'playing') {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, engage, onExit]);

  // ---------- derived view ----------
  const agents = useMemo(
    () =>
      W.agents.map((a) => {
        const f = terr.focus[a.id];
        return f ? { ...a, x: f.x, y: f.y } : a;
      }),
    [W.agents, terr.focus],
  );
  const now = Date.now();
  const touches = terr.touches[HOME_KEY];
  const lit = touches ? Object.keys(touches).length : 0;
  const edits = touches ? Object.values(touches).filter((t) => t.kind === 'edit').length : 0;
  const explored = Math.round((lit / files.length) * 100);
  const assigned = agents.filter((a) => a.id !== 'claude-prime');
  const doneCount = W.archived.length;
  const missionProgress = Math.round(
    W.objectives.reduce((s, o) => s + (o.state === 'done' ? 1 : o.state === 'active' ? 0.4 : 0), 0) * (100 / W.objectives.length),
  );
  const history = useRunHistory(agents, runKey);

  // camera
  const followed = W.cam.follow ? agents.find((a) => a.id === W.cam.follow) : undefined;
  const target = followed ? project(followed.x, followed.y) : project(W.cam.x, W.cam.y);
  const z = W.cam.z;
  const tx = Math.max(-22, Math.min(22, 50 - target.left));
  const ty = Math.max(-18, Math.min(18, 50 - target.top));
  const camStyle = { transform: `scale(${z}) translate(${(tx * Math.min(1, z - 0.85)).toFixed(2)}%, ${(ty * Math.min(1, z - 0.85)).toFixed(2)}%)` };
  const elapsed = elapsedRef.current;
  const cockpitAgent = W.cockpitId ? agents.find((a) => a.id === W.cockpitId) : undefined;
  const selected = agents.find((a) => a.id === W.selectedId) ?? agents[0];
  const cost = (W.tokens / 1e6) * USD_PER_MTOK;
  const noop = () => {};

  return (
    <div className={`fleet-command demo-mode${cockpitAgent ? ' fleet-command--cockpit' : ''}${phase !== 'playing' ? ' demo-mode--card' : ''}`}>
      <div className="demo-camera" style={camStyle}>
        <Map agents={agents} selectedId={W.selectedId} onSelect={noop} fog={{ territory: HOME_TERRITORY, touches, now }} bursts={W.bursts} />
      </div>
      <MissionBanner
        title={W.missionLabel === 'STANDBY' ? 'MISSION REPLAY' : W.missionLabel}
        leftMeta="ORCHESTRATOR v2.7.1  ·  REPLAY MODE  ·  NO API KEY"
        right={<HudToolbar onDemo={canExit ? onExit : undefined} demo />}
      />

      <div className="hud-column hud-column--left">
        <AgentList agents={agents} selectedId={W.selectedId} onSelect={noop} archived={W.archived} departing={W.departing} arriving={W.arriving} />
        <ActivityFeed entries={W.feed} />
        <Minimap agents={agents} selectedId={W.selectedId} territory={HOME_TERRITORY} touches={touches} now={now} />
      </div>

      <div className="hud-column hud-column--right">
        <MissionStatus
          progress={missionProgress}
          objective="SHIP THE DATA BRIDGE"
          statusLabel={missionProgress >= 100 ? 'COMPLETE' : phase === 'playing' ? 'IN PROGRESS' : 'STANDBY'}
          objectives={W.objectives}
        />
        <BurnMeter agents={agents} speed={BURN_SPEED} resetKey={runKey} />
        <NoticeBoard uplink={REPLAY_UPLINK} realCount={0} replay={{ notices: W.notices, clock: clock(elapsed) }} />
      </div>

      {cockpitAgent && (
        <Cockpit
          agent={cockpitAgent}
          override={undefined}
          lines={W.logs[cockpitAgent.id] ?? []}
          uplink={REPLAY_UPLINK}
          assignOpen={false}
          onAssignOpenChange={noop}
          onClose={noop}
          onHoldToggle={noop}
          onAssign={noop}
          onRetreat={noop}
          onApprove={noop}
          onTerminalSubmit={noop}
        />
      )}

      {W.territoryOpen && <TerritoryOverlay territories={[HOME_TERRITORY]} touches={terr.touches} agents={agents} now={now} onClose={noop} replay />}
      {W.warRoomOpen && <WarRoom lanes={history.lanes} start={history.start} now={now} onClose={noop} replay />}

      <CommandBar selected={selected} onCommand={noop} onOpenCockpit={noop} uplink={REPLAY_UPLINK} pulse={W.pulse} statusLabel="● REPLAY · SCRIPTED · NO API KEY" />

      {W.toast && <div className={`cmd-toast cmd-toast--${W.toast.tone}`}>{W.toast.text}</div>}

      {phase === 'playing' && W.caption && (
        <div key={W.caption.key} className={`demo-caption demo-caption--${W.caption.tone}`}>
          <strong>{W.caption.title}</strong>
          {W.caption.sub && <span>{W.caption.sub}</span>}
        </div>
      )}

      {W.pointer && phase === 'playing' && (
        <div className="demo-pointer" style={{ left: W.pointer.x, top: W.pointer.y }} aria-hidden>
          <span className="demo-pointer__reticle" />
          {W.pointer.click > 0 && <span key={W.pointer.click} className="demo-pointer__ripple" />}
        </div>
      )}

      {phase === 'playing' && (
        <div className="demo-rec" aria-label="Replay progress">
          <span className="demo-rec__dot" />
          {paused ? 'PAUSED' : 'REPLAY'} {clock(elapsed)} / {clock(DEMO_LENGTH_MS)}
          <div className="demo-rec__bar">
            <div style={{ width: `${Math.min(100, (elapsed / DEMO_LENGTH_MS) * 100)}%` }} />
          </div>
          <em>SPACE PAUSE · R RESTART{canExit ? ' · ESC EXIT' : ''}</em>
        </div>
      )}

      {phase === 'standby' && (
        <div className="demo-card demo-card--title">
          <div className="demo-card__inner">
            <span className="demo-card__eyebrow">MISSION REPLAY · OP-0417</span>
            <h1>AGENT FLEET COMMAND</h1>
            <p>Sixty seconds. Four AI coding agents. One commander.</p>
            <button type="button" className="demo-card__go" onClick={engage}>
              ▶ ENGAGE {autostart && countdown > 0 ? `· ${countdown}` : ''}
            </button>
            <small>CLICK TO ENGAGE WITH SOUND · NO API KEY NEEDED · M TO MUTE</small>
          </div>
        </div>
      )}

      {phase === 'ended' && (
        <div className="demo-card demo-card--end">
          <div className="demo-card__inner">
            <span className="demo-card__eyebrow">AFTER-ACTION REPORT · OP-0417</span>
            <h1>MISSION COMPLETE</h1>
            <div className="demo-stats">
              <div>
                <b>{Math.max(assigned.length, doneCount)}</b>
                <span>AGENTS DEPLOYED</span>
              </div>
              <div>
                <b>{lit}</b>
                <span>FILES TOUCHED</span>
              </div>
              <div>
                <b>{edits}</b>
                <span>FILES EDITED</span>
              </div>
              <div>
                <b>{explored}%</b>
                <span>TERRITORY CHARTED</span>
              </div>
              <div>
                <b>{(W.tokens / 1000).toFixed(0)}K</b>
                <span>EST TOKENS</span>
              </div>
              <div>
                <b>${cost.toFixed(2)}</b>
                <span>EST COST</span>
              </div>
              <div>
                <b>{W.interventions}</b>
                <span>HUMAN DECISIONS</span>
              </div>
              <div>
                <b>1</b>
                <span>PR READY</span>
              </div>
            </div>
            <div className="demo-card__actions">
              <button type="button" className="demo-card__go" onClick={engage}>
                ↻ REPLAY
              </button>
              {canExit && (
                <button type="button" className="demo-card__ghost" onClick={onExit}>
                  EXIT TO LIVE HUD
                </button>
              )}
            </div>
            <small>SIMULATED REPLAY · ESTIMATES ARE ILLUSTRATIVE{loop ? ' · LOOPING' : ''}</small>
          </div>
        </div>
      )}

      <div className="crt-overlay" aria-hidden />
      <div className="crt-flicker" aria-hidden />
    </div>
  );
}
