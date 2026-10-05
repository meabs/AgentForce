import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MissionBanner } from './components/MissionBanner';
import { AgentList } from './components/AgentList';
import { ActivityFeed } from './components/ActivityFeed';
import { Map } from './components/Map';
import { Minimap } from './components/Minimap';
import { MissionStatus } from './components/MissionStatus';
import { ResourcePanel } from './components/ResourcePanel';
import { NoticeBoard } from './components/NoticeBoard';
import { CommandBar, type CommandId } from './components/CommandBar';
import { Cockpit } from './components/Cockpit';
import { useActivityTicker } from './hooks/useActivityTicker';
import { mapCursorState, useCursorLive } from './hooks/useCursorLive';
import { useTerminalLogs } from './hooks/useTerminalLogs';
import type { ActivityEntry, Agent, AgentOverride, TermKind } from './types';
import './App.css';

const SUMMON_POOL = [
  { name: 'PROBE-11', classLabel: 'PROBE', role: 'Recon' },
  { name: 'VECTOR-2', classLabel: 'SYNTH', role: 'Build' },
  { name: 'RELAY-4', classLabel: 'RELAY', role: 'Comms' },
  { name: 'NOVA-6', classLabel: 'SCOUT', role: 'Tests' },
  { name: 'ECHO-12', classLabel: 'SYNTH', role: 'Docs' },
];

export default function App() {
  const [overrides, setOverrides] = useState<Record<string, AgentOverride>>({});
  const paused = useMemo(
    () => new Set(Object.entries(overrides).filter(([, o]) => o.held).map(([id]) => id)),
    [overrides],
  );
  const { agents: mockAgents, feed: mockFeed, addAgent } = useActivityTicker(paused);
  const { live, error: liveError } = useCursorLive();
  const [liveFeed, setLiveFeed] = useState<ActivityEntry[]>([]);
  const [actionFeed, setActionFeed] = useState<ActivityEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>('cursor-7');
  const [cockpitId, setCockpitId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone: 'amber' | 'green' | 'red' } | null>(null);
  const [approvals, setApprovals] = useState(0);
  const [tick, setTick] = useState(0);
  const summonCount = useRef(0);
  const toastTimer = useRef<number | undefined>(undefined);

  // 1) ticker + live CURSOR-7 merge
  const baseAgents: Agent[] = useMemo(
    () =>
      mockAgents.map((a) => {
        if (a.id !== 'cursor-7' || !live) return a;
        const status = mapCursorState(live.state);
        return {
          ...a,
          name: live.name || a.name,
          status,
          mission: live.title || a.mission,
          activity: live.summary || `${live.state.toUpperCase()}…`,
          progress: status === 'IDLE' ? 100 : a.progress,
          live: { rawState: live.state.toUpperCase(), url: live.url, updatedAt: live.updatedAt, id: live.id },
        };
      }),
    [mockAgents, live],
  );

  // 2) commander overrides on top
  const agents: Agent[] = useMemo(
    () =>
      baseAgents.map((a) => {
        const o = overrides[a.id];
        if (!o) return a;
        return {
          ...a,
          mission: o.mission ?? a.mission,
          status: o.status ?? a.status,
          activity: o.activity && (o.held || o.status) ? o.activity : a.activity,
          progress: Math.min(100, a.progress + (o.progressBoost ?? 0)),
          held: !!o.held,
          retreated: !!o.retreated,
        };
      }),
    [baseAgents, overrides],
  );

  const { logs, push: termPush, clear: termClear } = useTerminalLogs(agents, overrides, live);

  useEffect(() => {
    if (!live) return;
    const st = mapCursorState(live.state);
    setLiveFeed((prev) =>
      [
        {
          id: `live-${live.updatedAt}-${live.state}`,
          timestamp: Date.parse(live.updatedAt) || Date.now(),
          agentName: live.name || 'CURSOR-7',
          message: `[LIVE ${live.state.toUpperCase()}] ${live.summary}`,
          kind: (st === 'BLOCKED' ? 'warn' : st === 'IDLE' ? 'ok' : 'info') as ActivityEntry['kind'],
        },
        ...prev,
      ].slice(0, 10),
    );
  }, [live]);

  const feed = useMemo(() => {
    const base = live ? mockFeed.filter((e) => e.agentName !== 'CURSOR-7') : mockFeed;
    return [...actionFeed, ...liveFeed, ...base].sort((x, y) => y.timestamp - x.timestamp).slice(0, 48);
  }, [mockFeed, liveFeed, actionFeed, live]);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 2600);
    return () => window.clearInterval(t);
  }, []);

  const selected = useMemo(() => agents.find((a) => a.id === selectedId), [agents, selectedId]);
  const cockpitAgent = useMemo(() => agents.find((a) => a.id === cockpitId), [agents, cockpitId]);
  const missionProgress = Math.min(100, 62 + (tick % 6) + approvals * 3);
  const cpu = 41 + Math.round(Math.sin(tick * 0.7) * 6) + paused.size * -3;
  const mem = 58 + Math.round(Math.cos(tick * 0.5) * 4);
  const net = 27 + Math.round(Math.sin(tick * 0.9) * 8);

  // ---------- helpers ----------
  const flash = useCallback((text: string, tone: 'amber' | 'green' | 'red' = 'amber') => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }, []);

  const feedLog = useCallback((agentName: string, message: string, kind: ActivityEntry['kind']) => {
    setActionFeed((prev) =>
      [{ id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now(), agentName, message, kind }, ...prev].slice(0, 30),
    );
  }, []);

  const patch = useCallback((id: string, fn: (o: AgentOverride) => AgentOverride) => {
    setOverrides((prev) => ({ ...prev, [id]: fn(prev[id] ?? {}) }));
  }, []);

  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const overridesRef = useRef(overrides);
  overridesRef.current = overrides;

  // ---------- actions (shared by cockpit, command bar, keys, terminal) ----------
  const actHold = useCallback(
    (id: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      const o = overridesRef.current[id] ?? {};
      if (o.held) {
        patch(id, (p) => ({
          ...p,
          held: false,
          retreated: false,
          status: p.approved ? 'RUNNING' : undefined,
          activity: p.approved ? 'Executing approved plan…' : undefined,
        }));
        termPush(id, 'ok', `▶ RESUME · ${o.retreated ? 'returning from rally point · ' : ''}activity ticker re-engaged`);
        feedLog(a.name, 'RESUMED by commander', 'ok');
        flash(`▶ RESUME → ${a.name}`, 'green');
      } else {
        patch(id, (p) => ({ ...p, held: true, activity: `Holding position · ${a.activity}` }));
        termPush(id, 'warn', 'HOLD · commander froze activity updates (ticker paused)');
        if (a.live) termPush(id, 'sys', 'note: local hold only, the cloud agent itself keeps running');
        feedLog(a.name, 'HOLD position ordered', 'warn');
        flash(`❚❚ HOLD → ${a.name}`);
      }
    },
    [patch, termPush, feedLog, flash],
  );

  const actAssign = useCallback(
    (id: string, mission: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      patch(id, (p) => ({ ...p, mission }));
      termPush(id, 'tool', `fleet.assign(${a.name}, "${mission}")`);
      termPush(id, 'ok', `mission accepted: ${mission}`);
      if (a.live) termPush(id, 'sys', 'note: board label only; the cloud agent task is unchanged');
      feedLog(a.name, `assigned mission: ${mission}`, 'info');
      flash(`⌖ ${a.name} → ${mission.toUpperCase()}`);
      setAssignOpen(false);
    },
    [patch, termPush, feedLog, flash],
  );

  const actRetreat = useCallback(
    (id: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      if (overridesRef.current[id]?.retreated) {
        flash(`${a.name} already at rally point · RESUME to redeploy`);
        return;
      }
      patch(id, (p) => ({ ...p, held: true, retreated: true, status: 'IDLE', activity: 'Retreated to rally point · awaiting orders' }));
      termPush(id, 'warn', 'RETREAT ordered · disengaging from task · status → IDLE');
      termPush(id, 'sys', 'unit parked at rally point · use RESUME to redeploy');
      feedLog(a.name, 'RETREAT · falling back to rally point', 'warn');
      flash(`↩ RETREAT → ${a.name}`, 'red');
    },
    [patch, termPush, feedLog, flash],
  );

  const actApprove = useCallback(
    (id: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      const wasBlocked = a.status === 'BLOCKED';
      patch(id, (p) => ({
        ...p,
        progressBoost: (p.progressBoost ?? 0) + 15,
        ...(wasBlocked
          ? { approved: true, status: 'RUNNING' as const, held: false, retreated: false, activity: 'Plan approved · executing…' }
          : {}),
      }));
      setApprovals((n) => n + 1);
      termPush(id, 'ok', `PLAN APPROVED by commander · progress +15%${wasBlocked ? ' · block cleared → RUNNING' : ''}`);
      if (a.live) termPush(id, 'sys', 'note: approval is local to the board');
      feedLog(a.name, `plan APPROVED${wasBlocked ? ' · unblocked' : ''} (+15%)`, 'ok');
      flash(`✓ PLAN APPROVED → ${a.name} · ACK`, 'green');
    },
    [patch, termPush, feedLog, flash],
  );

  const actSummon = useCallback(() => {
    const n = summonCount.current++;
    const pick = SUMMON_POOL[n % SUMMON_POOL.length];
    const suffix = n >= SUMMON_POOL.length ? `-${Math.floor(n / SUMMON_POOL.length) + 1}` : '';
    const id = `${pick.name.toLowerCase()}${suffix}`;
    const agent: Agent = {
      id,
      name: `${pick.name}${suffix}`,
      mission: 'Awaiting Orders',
      status: 'IDLE',
      activity: 'Warping in…',
      progress: 5,
      classLabel: pick.classLabel,
      role: pick.role,
      hp: 100,
      tokens: 100,
      x: 25 + Math.random() * 50,
      y: 32 + Math.random() * 36,
    };
    addAgent(agent);
    setSelectedId(id);
    setCockpitId(id);
    window.setTimeout(() => {
      termPush(id, 'sys', `${agent.name} materialised at (${agent.x.toFixed(0)}, ${agent.y.toFixed(0)}) · systems online`);
    }, 50);
    feedLog(agent.name, 'SUMMONED to sector 7G', 'ok');
    flash(`＋ SUMMONED ${agent.name}`, 'green');
  }, [addAgent, termPush, feedLog, flash]);

  const openCockpit = useCallback((id: string) => {
    setSelectedId(id);
    setCockpitId(id);
    setAssignOpen(false);
  }, []);

  const runCommand = useCallback(
    (cmd: CommandId) => {
      if (cmd === 'summon') return actSummon();
      const id = selectedId;
      if (!id) return flash('NO UNIT SELECTED');
      if (cmd === 'assign') {
        setCockpitId(id);
        setAssignOpen(true);
        return;
      }
      if (cmd === 'hold') return actHold(id);
      if (cmd === 'retreat') return actRetreat(id);
      if (cmd === 'approve') return actApprove(id);
    },
    [selectedId, actSummon, actHold, actRetreat, actApprove, flash],
  );

  // ---------- terminal console ----------
  const onTerminalSubmit = useCallback(
    (id: string, raw: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      termPush(id, 'user', raw);
      const [verb, ...rest] = raw.split(/\s+/);
      const arg = rest.join(' ');
      const say = (kind: TermKind, text: string) => termPush(id, kind, text);
      switch (verb.toLowerCase()) {
        case 'help':
          say('sys', 'commands: status · hold · resume · approve · retreat · assign <mission> · clear · help');
          say('sys', 'anything else is relayed to the unit (simulated)');
          break;
        case 'status':
          say('out', `unit=${a.name} status=${a.status}${a.held ? ' (HOLD)' : ''} mission="${a.mission}"`);
          say('out', `progress=${a.progress}% hp=${a.hp}% tokens=${a.tokens}%`);
          if (a.live) say('uplink', `live state=${a.live.rawState} · ${a.live.url}`);
          break;
        case 'hold':
          if (!overridesRef.current[id]?.held) actHold(id);
          else say('sys', 'already holding');
          break;
        case 'resume':
          if (overridesRef.current[id]?.held) actHold(id);
          else say('sys', 'unit is not on hold');
          break;
        case 'approve':
          actApprove(id);
          break;
        case 'retreat':
          actRetreat(id);
          break;
        case 'assign':
          if (arg) actAssign(id, arg);
          else (setAssignOpen(true), say('sys', 'usage: assign <mission>  (or pick from the panel)'));
          break;
        case 'clear':
          termClear(id);
          break;
        default:
          if (a.live) {
            say('warn', 'local console only: this does not message the cloud agent');
            say('uplink', `open ${a.live.url} to talk to it directly`);
          } else {
            say('tool', `relay → ${a.name}: "${raw}"`);
            window.setTimeout(() => termPush(id, 'think', `ack, commander. folding "${raw}" into current plan`), 700);
          }
      }
    },
    [termPush, termClear, actHold, actApprove, actRetreat, actAssign],
  );

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key;
      if (k === 'Escape') {
        if (assignOpen) setAssignOpen(false);
        else setCockpitId(null);
        return;
      }
      const n = Number(k);
      if (Number.isInteger(n) && n >= 1 && n <= 9 && n <= agents.length) {
        const id = agents[n - 1].id;
        setSelectedId(id);
        if (cockpitId) setCockpitId(id);
        return;
      }
      if (k === 'Enter' && selectedId) return openCockpit(selectedId);
      if (k === ' ' || k.toLowerCase() === 'h') {
        e.preventDefault();
        return runCommand('hold');
      }
      const map: Record<string, CommandId> = { s: 'summon', a: 'assign', r: 'retreat', p: 'approve' };
      const cmd = map[k.toLowerCase()];
      if (cmd) {
        e.preventDefault();
        runCommand(cmd);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [agents, assignOpen, cockpitId, selectedId, openCockpit, runCommand]);

  return (
    <div className={`fleet-command${cockpitAgent ? ' fleet-command--cockpit' : ''}`}>
      <Map agents={agents} selectedId={selectedId} onSelect={openCockpit} />
      <MissionBanner />

      <div className="hud-column hud-column--left">
        <AgentList agents={agents} selectedId={selectedId} onSelect={openCockpit} />
        <ActivityFeed entries={feed} />
        <Minimap agents={agents} selectedId={selectedId} />
      </div>

      <div className="hud-column hud-column--right">
        <MissionStatus progress={missionProgress} />
        <ResourcePanel cpu={cpu} mem={mem} net={net} />
        <NoticeBoard liveAgent={agents.find((a) => a.live)} liveError={liveError} />
      </div>

      {cockpitAgent && (
        <Cockpit
          agent={cockpitAgent}
          override={overrides[cockpitAgent.id]}
          lines={logs[cockpitAgent.id] ?? []}
          assignOpen={assignOpen}
          onAssignOpenChange={setAssignOpen}
          onClose={() => (setCockpitId(null), setAssignOpen(false))}
          onHoldToggle={() => actHold(cockpitAgent.id)}
          onAssign={(m) => actAssign(cockpitAgent.id, m)}
          onRetreat={() => actRetreat(cockpitAgent.id)}
          onApprove={() => actApprove(cockpitAgent.id)}
          onTerminalSubmit={(v) => onTerminalSubmit(cockpitAgent.id, v)}
        />
      )}

      <CommandBar
        selected={selected}
        onCommand={runCommand}
        onOpenCockpit={() => selectedId && openCockpit(selectedId)}
      />

      {toast && <div className={`cmd-toast cmd-toast--${toast.tone}`}>{toast.text}</div>}

      <div className="crt-overlay" aria-hidden />
      <div className="crt-flicker" aria-hidden />
    </div>
  );
}
