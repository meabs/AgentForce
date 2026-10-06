import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MissionBanner } from './components/MissionBanner';
import { AgentList } from './components/AgentList';
import { ActivityFeed } from './components/ActivityFeed';
import { Map } from './components/Map';
import { Minimap } from './components/Minimap';
import { MissionStatus } from './components/MissionStatus';
import { BurnMeter } from './components/BurnMeter';
import { HudToolbar } from './components/HudToolbar';
import { TerritoryOverlay } from './components/TerritoryOverlay';
import { WarRoom } from './components/WarRoom';
import type { ArchivedUnit } from './components/ArchiveTray';
import { useMockExplorers, useRepoIntel, useTerritoryState } from './hooks/useTerritory';
import { useRunHistory } from './hooks/useRunHistory';
import { extractPaths, HOME_KEY, HOME_TERRITORY, resolvePath } from './lib/territory';
import { say, sfx, spoken, toggleAmbient, toggleMuted, VOICE } from './lib/sfx';
import { callsignOf, hash } from './lib/callsign';
import { NoticeBoard } from './components/NoticeBoard';
import { CommandBar, type CommandId } from './components/CommandBar';
import { Cockpit } from './components/Cockpit';
import { useActivityTicker } from './hooks/useActivityTicker';
import { mapCursorState, useCursorLive } from './hooks/useCursorLive';
import { useTerminalLogs } from './hooks/useTerminalLogs';
import { useCloudAgents } from './hooks/useCloudAgents';
import { useLiveStream } from './hooks/useLiveStream';
import type { LiveEvent } from './lib/liveStream';
import { SummonDialog, ConfirmDialog, type ConfirmSpec, type LaunchSpec } from './components/Dialogs';
import { FleetTable } from './components/FleetTable';
import { FilterBar } from './components/FilterBar';
import { ConnectionNotice } from './components/ConnectionNotice';
import { HelpOverlay } from './components/HelpOverlay';
import { Toasts, type ToastItem, type ToastTone } from './components/Toasts';
import type { ConvoState } from './components/Cockpit';
import { countsOf, EMPTY_FILTER, filterActive, isReal, matches, plainStatus, repoShort, type FleetFilter } from './lib/agentView';
import { DEFAULT_REPO, friendlyError, isCloudId, OFFLINE_MSG, uplink, type CloudAgent, type CloudMessage } from './lib/uplink';
import type { ActivityEntry, Agent, AgentOverride, TermKind } from './types';
import './App.css';

const SUMMON_POOL = [
  { name: 'PROBE-11', classLabel: 'PROBE', role: 'Recon' },
  { name: 'VECTOR-2', classLabel: 'SYNTH', role: 'Build' },
  { name: 'RELAY-4', classLabel: 'RELAY', role: 'Comms' },
  { name: 'NOVA-6', classLabel: 'SCOUT', role: 'Tests' },
  { name: 'ECHO-12', classLabel: 'SYNTH', role: 'Docs' },
];

const TERMINAL_RE = /^(FINISHED|COMPLETED|COMPLETE|DONE|SUCCEEDED|SUCCESS|EXPIRED|CANCELLED|CANCELED|STOPPED|ARCHIVED)$/;
/** A finished summoned unit lingers on the roster this long (victory lap) before docking in the archive. */
const DOCK_AFTER_MS = 45_000;
const ARCHIVE_KEY = 'afc.archive.v1';
const VIEW_KEY = 'afc.view.v1';
const SOURCE_KEY = 'afc.source.v1';
const REPOS_KEY = 'afc.repos.v1';


function loadJson<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}

function cloudUnit(a: CloudAgent): Agent {
  const h = hash(a.id);
  const status = mapCursorState(a.status);
  const started = Date.parse(a.createdAt ?? '') || Date.now();
  const mins = (Date.now() - started) / 60_000;
  return {
    id: a.id,
    name: callsignOf(a.id),
    mission: a.name && a.name !== a.id ? a.name : 'Cloud mission',
    status,
    activity: a.summary || (status === 'RUNNING' ? `${a.status}… working in the cloud` : `${a.status} · awaiting orders`),
    progress: status === 'IDLE' ? 100 : status === 'BLOCKED' ? 60 : Math.min(95, Math.round(12 + mins * 6)),
    classLabel: 'CLOUD',
    role: 'Live',
    hp: status === 'BLOCKED' ? 55 : 100,
    tokens: 100,
    x: 22 + (h % 56),
    y: 30 + ((h >>> 8) % 40),
    cloudId: a.id,
    cloud: {
      rawStatus: a.status,
      url: a.url,
      repo: a.repo,
      ref: a.ref,
      branch: a.branch,
      prUrl: a.prUrl,
      summary: a.summary,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    },
  };
}

const clip = (t: string, n = 600) => {
  const one = t.replace(/\s+/g, ' ').trim();
  return one.length > n ? `${one.slice(0, n)}…` : one;
};

export default function App({ onDemo }: { onDemo?: () => void }) {
  const [overrides, setOverrides] = useState<Record<string, AgentOverride>>({});
  const paused = useMemo(
    () => new Set(Object.entries(overrides).filter(([, o]) => o.held).map(([id]) => id)),
    [overrides],
  );
  const { agents: mockAgents, feed: mockFeed, addAgent } = useActivityTicker(paused);
  const { live, error: liveError } = useCursorLive();
  const liveCloudId = isCloudId(live?.id) ? live!.id : null;
  const [liveFeed, setLiveFeed] = useState<ActivityEntry[]>([]);
  const [actionFeed, setActionFeed] = useState<ActivityEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>('cursor-7');
  const [cockpitId, setCockpitId] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [summonOpen, setSummonOpen] = useState(false);
  const [summonBusy, setSummonBusy] = useState(false);
  const [summonError, setSummonError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastSeq = useRef(0);
  const [view, setView] = useState<'map' | 'list'>(() => (loadJson<string>(VIEW_KEY, 'map') === 'list' ? 'list' : 'map'));
  const [helpOpen, setHelpOpen] = useState(false);
  const [filter, setFilter] = useState<FleetFilter>(() => ({ ...EMPTY_FILTER, source: loadJson<FleetFilter['source']>(SOURCE_KEY, 'all') }));
  const [convo, setConvo] = useState<Record<string, CloudMessage[]>>({});
  const [convoState, setConvoState] = useState<Record<string, ConvoState>>({});
  const [models, setModels] = useState<string[] | null>(null);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [recentRepos, setRecentRepos] = useState<string[]>(() => loadJson<string[]>(REPOS_KEY, []));
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, JSON.stringify(view));
      localStorage.setItem(SOURCE_KEY, JSON.stringify(filter.source));
      localStorage.setItem(REPOS_KEY, JSON.stringify(recentRepos.slice(0, 8)));
    } catch {
      /* ignore */
    }
  }, [view, filter.source, recentRepos]);
  const [approvals, setApprovals] = useState(0);
  const [tick, setTick] = useState(0);
  const summonCount = useRef(0);
  const [now, setNow] = useState(() => Date.now());
  const [territoryOpen, setTerritoryOpen] = useState(false);
  const [warRoomOpen, setWarRoomOpen] = useState(false);
  const [pending, setPending] = useState<Agent[]>([]);
  const [lastLaunch, setLastLaunch] = useState<LaunchSpec | undefined>();
  const [arriving, setArriving] = useState<ReadonlySet<string>>(new Set());
  const [bursts, setBursts] = useState<Record<string, 'done' | 'alert'>>({});
  /** Board-only archive: manual parks + explicit recalls (persisted) */
  const [archiveState, setArchiveState] = useState<{ parked: Record<string, number>; recalled: string[] }>(() =>
    loadJson(ARCHIVE_KEY, { parked: {}, recalled: [] }),
  );
  useEffect(() => {
    try {
      localStorage.setItem(ARCHIVE_KEY, JSON.stringify(archiveState));
    } catch {
      /* ignore */
    }
  }, [archiveState]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const terr = useTerritoryState();
  const touchTile = terr.touch;

  // 0) LIVE COMMAND UPLINK: real cloud agents via the local bridge
  const unitIdOfCloud = useCallback((cid: string) => (cid === liveCloudId ? 'cursor-7' : cid), [liveCloudId]);
  const cloudIdOfUnit = useCallback(
    (uid: string | null) => (!uid ? null : isCloudId(uid) ? uid : uid === 'cursor-7' ? liveCloudId : null),
    [liveCloudId],
  );
  const heldCloudIds = useMemo(() => {
    const s = new Set<string>();
    for (const [uid, o] of Object.entries(overrides)) {
      const cid = o.held ? cloudIdOfUnit(uid) : null;
      if (cid) s.add(cid);
    }
    return s;
  }, [overrides, cloudIdOfUnit]);
  const termPushRef = useRef<(id: string, kind: TermKind, text: string) => void>(() => {});
  /** Prompts we already echoed locally, so the transcript poll doesn't print them twice. */
  const sentRef = useRef<Record<string, string[]>>({});
  const noteSent = useCallback((cid: string, text: string) => {
    (sentRef.current[cid] ??= []).push(text.trim());
  }, []);
  const onCloudMessages = useCallback(
    (cid: string, msgs: CloudMessage[], first: boolean) => {
      const uid = unitIdOfCloud(cid);
      const push = termPushRef.current;
      setConvo((c) => ({ ...c, [cid]: first ? msgs : [...(c[cid] ?? []), ...msgs] }));
      setConvoState((c) => ({ ...c, [cid]: { status: 'ok' } }));
      let show = msgs;
      if (first) {
        push(uid, 'uplink', `transcript linked · ${msgs.length} message${msgs.length === 1 ? '' : 's'} on record`);
        if (msgs.length > 8) {
          push(uid, 'sys', `… ${msgs.length - 8} earlier messages (OPEN AGENT for the full log)`);
          show = msgs.slice(-8);
        }
      }
      for (const m of show) {
        if (!m.text.trim()) continue;
        if (m.type === 'user') {
          const sent = sentRef.current[cid] ?? [];
          const i = sent.indexOf(m.text.trim());
          if (i >= 0) {
            sent.splice(i, 1);
            continue;
          }
        }
        push(uid, m.type === 'user' ? 'user' : m.type === 'status' ? 'uplink' : 'think', clip(m.text));
      }
    },
    [unitIdOfCloud],
  );
  /** Cloud id whose transcript is currently owned by the cockpit's live run stream. */
  const liveIdRef = useRef<string | null>(null);
  const isStreaming = useCallback((cid: string) => liveIdRef.current === cid, []);
  const cloud = useCloudAgents({
    extraIds: useMemo(() => (liveCloudId ? [liveCloudId] : []), [liveCloudId]),
    focusId: cloudIdOfUnit(cockpitId),
    heldIds: heldCloudIds,
    onMessages: onCloudMessages,
    onConversationError: useCallback((cid: string, error: string) => setConvoState((c) => ({ ...c, [cid]: { status: 'error', error } })), []),
    isStreaming,
  });
  const uplinkOnline = cloud.info.phase === 'online';
  // LIVE RUN STREAMING: stream while a real unit's cockpit is open and the unit is running.
  const cockpitCloudId = cloudIdOfUnit(cockpitId);
  const streamActive =
    !!cockpitCloudId &&
    uplinkOnline &&
    !heldCloudIds.has(cockpitCloudId) &&
    !!cloud.agents[cockpitCloudId] &&
    mapCursorState(cloud.agents[cockpitCloudId].status) === 'RUNNING';
  liveIdRef.current = streamActive ? cockpitCloudId : null;

  const cloudUnits: Agent[] = useMemo(() => {
    const ids = [...cloud.summonedIds, ...cloud.listedIds].filter(
      (id, i, arr) => arr.indexOf(id) === i && id !== liveCloudId && cloud.agents[id],
    );
    return ids.map((id) => cloudUnit(cloud.agents[id]));
  }, [cloud.summonedIds, cloud.listedIds, cloud.agents, liveCloudId]);

  // 1) ticker + live CURSOR-7 merge (+ uplink overlay when the bridge knows the same agent)
  const baseAgents: Agent[] = useMemo(
    () => [
      ...mockAgents.map((a) => {
        if (a.id !== 'cursor-7' || !live) return a;
        const c = liveCloudId && uplinkOnline ? cloud.agents[liveCloudId] : undefined;
        const state = (c?.status ?? live.state).toUpperCase();
        const status = mapCursorState(state);
        return {
          ...a,
          name: live.name || a.name,
          status,
          mission: live.title || c?.name || a.mission,
          activity: c?.summary || live.summary || `${state}…`,
          progress: status === 'IDLE' ? 100 : a.progress,
          live: {
            rawState: state,
            url: c?.url || live.url,
            updatedAt: c?.updatedAt && Date.parse(c.updatedAt) > Date.parse(live.updatedAt) ? c.updatedAt : live.updatedAt,
            id: live.id,
          },
          cloudId: liveCloudId ?? undefined,
          cloud: c
            ? { rawStatus: c.status, url: c.url, repo: c.repo, ref: c.ref, branch: c.branch, prUrl: c.prUrl, summary: c.summary, updatedAt: c.updatedAt }
            : undefined,
        };
      }),
      ...cloudUnits,
      ...pending,
    ],
    [mockAgents, live, liveCloudId, uplinkOnline, cloud.agents, cloudUnits, pending],
  );

  // 2) commander overrides on top (+ simulated units glide to the file they are working on)
  const focus = terr.focus;
  const agents: Agent[] = useMemo(
    () =>
      baseAgents.map((a0) => {
        const f = !a0.cloudId && !a0.live ? focus[a0.id] : undefined;
        const a = f ? { ...a0, x: f.x, y: f.y } : a0;
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
    [baseAgents, overrides, focus],
  );

  useMockExplorers(agents, terr.touch);
  const intel = useRepoIntel(cloud.agents, uplinkOnline, terr.touch);
  const territories = useMemo(() => [HOME_TERRITORY, ...intel.territories], [intel.territories]);

  // ---------- archive tray ----------
  const finishedAt = useRef<Record<string, number>>({});
  const recalledSet = useMemo(() => new Set(archiveState.recalled), [archiveState.recalled]);
  const { activeAgents, archivedUnits, departing } = useMemo(() => {
    const active: Agent[] = [];
    const parked: ArchivedUnit[] = [];
    const leaving = new Set<string>();
    for (const a of agents) {
      const raw = (a.cloud?.rawStatus ?? '').toUpperCase();
      const terminal = !!a.cloudId && a.id !== 'cursor-7' && TERMINAL_RE.test(raw);
      if (terminal && finishedAt.current[a.id] === undefined) {
        // Seen finished on first sight: it finished before this session, dock immediately.
        finishedAt.current[a.id] = cloud.summonedIds.includes(a.id) ? now : now - DOCK_AFTER_MS;
      }
      if (!terminal) delete finishedAt.current[a.id];
      const manual = archiveState.parked[a.id];
      const age = terminal ? now - finishedAt.current[a.id] : 0;
      const auto = terminal && !recalledSet.has(a.id) && age >= DOCK_AFTER_MS;
      if (manual || auto) {
        parked.push({
          id: a.id,
          name: a.name,
          mission: a.mission,
          rawStatus: raw || (a.status === 'IDLE' ? 'PARKED' : a.status),
          finishedAt: Date.parse(a.cloud?.updatedAt ?? '') || Date.parse(a.cloud?.createdAt ?? '') || manual || finishedAt.current[a.id],
          prUrl: a.cloud?.prUrl,
          url: a.cloud?.url,
          repo: a.cloud?.repo,
          summary: a.cloud?.summary,
          real: !!a.cloudId,
        });
      } else {
        active.push(a);
        if (terminal && !recalledSet.has(a.id) && age >= DOCK_AFTER_MS - 1600) leaving.add(a.id);
      }
    }
    parked.sort((x, y) => (y.finishedAt ?? 0) - (x.finishedAt ?? 0));
    return { activeAgents: active, archivedUnits: parked, departing: leaving as ReadonlySet<string> };
  }, [agents, archiveState, recalledSet, now, cloud.summonedIds]);

  const toggleArchive = useCallback((id: string) => {
    sfx.tick();
    setArchiveState((p) => {
      const isParked = !!p.parked[id];
      const parked = { ...p.parked };
      if (isParked) delete parked[id];
      else parked[id] = Date.now();
      return { parked, recalled: isParked ? [...p.recalled.filter((x) => x !== id), id] : p.recalled.filter((x) => x !== id) };
    });
  }, []);
  const recallUnit = useCallback((id: string) => {
    sfx.ack();
    setArchiveState((p) => {
      const parked = { ...p.parked };
      delete parked[id];
      return { parked, recalled: [...p.recalled.filter((x) => x !== id), id].slice(-50) };
    });
    setArriving(new Set([id]));
    window.setTimeout(() => setArriving(new Set()), 1400);
  }, []);
  const archivedIds = useMemo(() => new Set(archivedUnits.map((u) => u.id)), [archivedUnits]);
  /** Board-only bulk archive (and its undo). */
  const parkMany = useCallback((ids: string[], on: boolean) => {
    setArchiveState((p) => {
      const parked = { ...p.parked };
      for (const id of ids) {
        if (on) parked[id] = Date.now();
        else delete parked[id];
      }
      const set = new Set(ids);
      return { parked, recalled: on ? p.recalled.filter((x) => !set.has(x)) : [...p.recalled.filter((x) => !set.has(x)), ...ids].slice(-80) };
    });
  }, []);
  const history = useRunHistory(activeAgents);
  const cloudRuns = useMemo(() => Object.values(cloud.agents).map((a) => ({ ...a, callsign: callsignOf(a.id) })), [cloud.agents]);

  const { logs, push: termPush, stream: termStream, seal: termSeal, clear: termClear } = useTerminalLogs(agents, overrides, live);
  termPushRef.current = termPush;

  // LIVE RUN STREAMING: bridge SSE events -> terminal lines, board status, fog-of-war tiles.
  const liveSeen = useRef<Record<string, { calls: Set<string>; history: boolean; status?: string }>>({});
  const { noteStatus, primeConversation } = cloud;
  const addLive = intel.addLive;
  const onLiveEvent = useCallback(
    (cid: string, e: LiveEvent) => {
      const uid = unitIdOfCloud(cid);
      const st = (liveSeen.current[cid] ??= { calls: new Set(), history: false });
      switch (e.type) {
        case 'hello':
          termPush(
            uid,
            'uplink',
            e.mode === 'stream'
              ? `LIVE LINK · run ${e.runId ?? '?'} · streaming events`
              : `POLLING · stream unavailable (${e.reason ?? 'unknown'}) · 1 s transcript diff`,
          );
          break;
        case 'status':
          noteStatus(cid, e.status);
          // terminal statuses are reported by the `result` line
          if (e.status !== st.status && mapCursorState(e.status) === 'RUNNING') {
            st.status = e.status;
            termPush(uid, 'uplink', `status → ${e.status}`);
          }
          break;
        case 'assistant':
          termStream(uid, 'say', e.text, e.msg !== undefined ? `say:${e.msg}` : 'say');
          break;
        case 'thinking':
          termStream(uid, 'think', e.text, 'think');
          break;
        case 'tool': {
          const t = e.tool;
          if (!st.calls.has(t.callId)) {
            st.calls.add(t.callId);
            termPush(uid, 'call', t.label);
          }
          const paths = [...t.paths, ...(t.verb === 'run' ? extractPaths(t.label) : [])];
          if (paths.length) addLive(cid, paths, t.verb === 'edit' || t.verb === 'delete' ? 'edit' : 'read');
          break;
        }
        case 'user': {
          const sent = sentRef.current[cid] ?? [];
          const i = sent.indexOf(e.text.trim());
          if (i >= 0) sent.splice(i, 1);
          else termPush(uid, 'user', clip(e.text));
          break;
        }
        case 'history':
          if (st.history) break;
          st.history = true;
          termPush(uid, 'uplink', `transcript · last ${e.messages.length} of ${e.total} message${e.total === 1 ? '' : 's'}`);
          e.messages.forEach((m, j) => {
            if (!m.text.trim()) return;
            // keep the transcript index as stream key so later deltas extend the same line
            if (m.type === 'user') termPush(uid, 'user', clip(m.text));
            else termStream(uid, 'say', m.text, `say:${e.total - e.messages.length + j}`);
          });
          break;
        case 'result': {
          termSeal(uid);
          if (e.status) noteStatus(cid, e.status);
          st.status = e.status;
          const ok = !/ERROR|FAIL|CANCEL|EXPIRED/.test(e.status);
          const secs = e.durationMs ? ` in ${(e.durationMs / 1000).toFixed(1)} s` : '';
          // (result.git can name a branch that was never pushed, so only a PR link is shown)
          termPush(uid, ok ? 'ok' : 'err', `run ${e.status}${secs}${e.prUrl ? ` · PR ${e.prUrl}` : ''}`);
          break;
        }
        case 'error':
          termPush(uid, e.fatal ? 'err' : 'warn', `${e.code}: ${e.message}`);
          break;
        case 'done':
          termSeal(uid);
          break;
      }
    },
    [unitIdOfCloud, termPush, termStream, termSeal, noteStatus, addLive],
  );
  const onLiveClosed = useCallback(
    (cid: string, reason: string) => {
      const uid = unitIdOfCloud(cid);
      termSeal(uid);
      termPush(uid, 'sys', `live link closed · ${reason}`);
      void primeConversation(cid);
    },
    [unitIdOfCloud, termSeal, termPush, primeConversation],
  );
  const liveLink = useLiveStream(cockpitCloudId, streamActive, onLiveEvent, onLiveClosed);

  // Terminal intel: file paths that simulated units print light up their tiles.
  const seenLine = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const [id, lines] of Object.entries(logs)) {
      if (id.startsWith('bc') || id.startsWith('warp-')) continue;
      if (id === 'cursor-7' && live) continue;
      const last = seenLine.current[id];
      let start = 0;
      if (last) {
        const i = lines.findIndex((l) => l.id === last);
        start = i >= 0 ? i + 1 : Math.max(0, lines.length - 3);
      } else start = lines.length; // skip seeded history on first sight
      if (lines.length) seenLine.current[id] = lines[lines.length - 1].id;
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) continue;
      for (const l of lines.slice(start)) {
        const paths = extractPaths(l.text)
          .map((p) => resolvePath(HOME_TERRITORY, p))
          .filter((p): p is string => !!p);
        if (paths.length) touchTile(HOME_KEY, paths, a, /\b(edit|write_file|apply)\b/.test(l.text) ? 'edit' : 'read');
      }
    }
  }, [logs, live, touchTile]);

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

  // ---------- helpers ----------
  const dismissToast = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const flash = useCallback(
    (text: string, tone: ToastTone = 'amber', action?: ToastItem['action']) => {
      const id = ++toastSeq.current;
      setToasts((t) => [...t.slice(-2), { id, text, tone, action }]);
      window.setTimeout(() => dismissToast(id), action ? 8000 : tone === 'red' ? 6000 : 3200);
    },
    [dismissToast],
  );

  const feedLog = useCallback((agentName: string, message: string, kind: ActivityEntry['kind']) => {
    setActionFeed((prev) =>
      [{ id: `act-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: Date.now(), agentName, message, kind }, ...prev].slice(0, 30),
    );
  }, []);

  const burst = useCallback((id: string, kind: 'done' | 'alert') => {
    setBursts((b) => ({ ...b, [id]: kind }));
    window.setTimeout(
      () =>
        setBursts((b) => {
          const n = { ...b };
          delete n[id];
          return n;
        }),
      3400,
    );
  }, []);

  // Uplink status transitions → terminal + activity feed (+ fanfare / klaxon)
  const prevCloudStatus = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const a of Object.values(cloud.agents)) {
      const prev = prevCloudStatus.current[a.id];
      prevCloudStatus.current[a.id] = a.status;
      if (!prev || prev === a.status) continue;
      const uid = unitIdOfCloud(a.id);
      const name = uid === 'cursor-7' ? 'CURSOR-7' : callsignOf(a.id);
      const st = mapCursorState(a.status);
      termPush(uid, st === 'BLOCKED' ? 'warn' : st === 'IDLE' ? 'ok' : 'uplink', `state ${prev} → ${a.status}`);
      if (st !== 'RUNNING' && a.summary) termPush(uid, 'think', clip(a.summary));
      if (a.prUrl && st === 'IDLE') termPush(uid, 'ok', `PR ready · ${a.prUrl}`);
      feedLog(name, `[UPLINK ${a.status}] ${clip(a.summary || a.name, 80)}`, st === 'BLOCKED' ? 'warn' : st === 'IDLE' ? 'ok' : 'info');
      const was = mapCursorState(prev);
      if (st === 'IDLE' && was !== 'IDLE') {
        sfx.fanfare();
        window.setTimeout(() => say(uid === 'cursor-7' ? `Cursor 7. ${VOICE.complete}` : `Cloud unit. ${VOICE.complete}`, { force: true }), 900);
        burst(uid, 'done');
      } else if (st === 'BLOCKED' && was !== 'BLOCKED') {
        sfx.klaxon();
        window.setTimeout(() => say(VOICE.alert, { force: true }), 700);
        burst(uid, 'alert');
      } else if (st === 'RUNNING' && was !== 'RUNNING') {
        sfx.ack();
      }
    }
  }, [cloud.agents, unitIdOfCloud, termPush, feedLog, burst]);

  const archiveToggle = useCallback(
    (id: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      const wasArchived = archivedIds.has(id);
      if (wasArchived) recallUnit(id);
      else toggleArchive(id);
      flash(
        wasArchived ? `Restored ${a?.name ?? id} to the roster` : `Archived ${a?.name ?? id} (board only, nothing sent to Cursor)`,
        'amber',
        { label: 'Undo', run: () => (wasArchived ? parkMany([id], true) : parkMany([id], false)) },
      );
    },
    [archivedIds, recallUnit, toggleArchive, flash, parkMany],
  );
  const archiveFinished = useCallback(() => {
    const ids = activeAgents.filter((a) => isReal(a) && !a.pending && plainStatus(a).group === 'done').map((a) => a.id);
    if (!ids.length) return;
    parkMany(ids, true);
    sfx.tick();
    flash(`Archived ${ids.length} finished agent${ids.length === 1 ? '' : 's'} (board only)`, 'amber', { label: 'Undo', run: () => parkMany(ids, false) });
  }, [activeAgents, parkMany, flash]);

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
        termPush(
          id,
          'ok',
          a.cloudId
            ? '▶ RESUME BOARD · uplink polling re-engaged'
            : `▶ RESUME · ${o.retreated ? 'returning from rally point · ' : ''}activity ticker re-engaged`,
        );
        feedLog(a.name, 'RESUMED by commander', 'ok');
        flash(`▶ RESUME → ${a.name}`, 'green');
        sfx.ack();
      } else {
        sfx.hold();
        say(VOICE.holding);
        patch(id, (p) => ({ ...p, held: true, activity: `Holding position · ${a.activity}` }));
        if (a.cloudId) {
          termPush(id, 'warn', 'HOLD BOARD · board updates for this unit paused (no status polling, no transcript)');
          termPush(id, 'sys', 'local only: the cloud agent itself keeps running · use RETREAT to actually stop it');
          feedLog(a.name, 'board HOLD (local, agent keeps running)', 'warn');
          flash(`❚❚ HOLD BOARD → ${a.name}`);
        } else {
          termPush(id, 'warn', 'HOLD · commander froze activity updates (ticker paused)');
          if (a.live) termPush(id, 'sys', 'note: local hold only, the cloud agent itself keeps running');
          feedLog(a.name, 'HOLD position ordered', 'warn');
          flash(`❚❚ HOLD → ${a.name}`);
        }
      }
    },
    [patch, termPush, feedLog, flash],
  );

  const localAssign = useCallback(
    (id: string, mission: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      patch(id, (p) => ({ ...p, mission }));
      termPush(id, 'tool', `fleet.assign(${a.name}, "${mission}")`);
      termPush(id, 'ok', `mission accepted: ${mission}`);
      if (a.cloudId) termPush(id, 'sys', 'note: board label only; the cloud agent task is unchanged');
      feedLog(a.name, `assigned mission: ${mission}`, 'info');
      flash(`⌖ ${a.name} → ${mission.toUpperCase()}`);
      sfx.ack();
      say(VOICE.orders);
      setAssignOpen(false);
    },
    [patch, termPush, feedLog, flash],
  );

  const localRetreat = useCallback(
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
      sfx.retreat();
      say(VOICE.retreat);
    },
    [patch, termPush, feedLog, flash],
  );

  const localApprove = useCallback(
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
      if (a.cloudId) termPush(id, 'sys', 'note: approval is local to the board');
      feedLog(a.name, `plan APPROVED${wasBlocked ? ' · unblocked' : ''} (+15%)`, 'ok');
      flash(`✓ PLAN APPROVED → ${a.name} · ACK`, 'green');
      sfx.ack();
      say(VOICE.approved);
    },
    [patch, termPush, feedLog, flash],
  );

  // ---------- uplink-routed orders for real units (bc- ids) ----------
  const setBusy = useCallback((id: string, on: boolean) => {
    setBusyIds((prev) => {
      const n = new Set(prev);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  }, []);

  /** Uplink is known offline: say so, then run the old local board order as fallback. */
  const offlineFallback = useCallback(
    (id: string, what: string, fallback: () => void) => {
      termPush(id, 'err', `${OFFLINE_MSG} · ${what} not transmitted`);
      termPush(id, 'sys', 'falling back to a local board order');
      flash(`⚠ ${OFFLINE_MSG}`, 'red');
      sfx.error();
      fallback();
    },
    [termPush, flash],
  );

  const sendFollowup = useCallback(
    async (id: string, text: string, label: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      const cid = a?.cloudId;
      if (!a || !cid) return false;
      setBusy(id, true);
      noteSent(cid, text);
      termPush(id, 'tool', `uplink.followup(${cid.slice(0, 15)}…, "${clip(text, 160)}")`);
      const r = await cloud.followup(cid, text);
      setBusy(id, false);
      if (r.ok) {
        termPush(id, 'ok', `${label} transmitted · agent re-engaging`);
        feedLog(a.name, `${label} → cloud agent`, 'ok');
        flash(`Follow-up sent to ${a.name}. It is working again.`, 'green');
        sfx.ack();
        say(VOICE.orders);
        return true;
      }
      if (r.status === 503) {
        offlineFallback(id, label, () => {});
        return false;
      }
      termPush(id, 'err', `${label} failed · ${r.status ? `HTTP ${r.status} · ` : ''}${r.error}`);
      if (r.status === 409) termPush(id, 'sys', 'agent busy: wait for the current run to finish, or RETREAT it first');
      feedLog(a.name, `${label} FAILED: ${r.error}`, 'warn');
      flash(`Follow-up to ${a.name} failed. ${friendlyError(r)}`, 'red');
      sfx.error();
      return false;
    },
    [cloud, termPush, feedLog, flash, setBusy, offlineFallback, noteSent],
  );

  const actAssign = useCallback(
    (id: string, text: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      if (!a.cloudId) return localAssign(id, text);
      if (cloud.info.phase === 'offline') return offlineFallback(id, 'follow-up', () => localAssign(id, text));
      termPush(id, 'user', text);
      void sendFollowup(id, text, 'mission follow-up').then((ok) => {
        if (ok) {
          patch(id, (p) => ({ ...p, mission: clip(text, 60) }));
          setAssignOpen(false);
        }
      });
    },
    [cloud.info.phase, localAssign, offlineFallback, sendFollowup, termPush, patch],
  );

  /** Detail-panel composer: resolves true when Cursor accepted the follow-up (so the box can clear). */
  const actSendFollowup = useCallback(
    async (id: string, text: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a?.cloudId) return false;
      if (cloud.info.phase === 'offline') {
        flash(friendlyError({ status: 503, code: 'NO_API_KEY', error: OFFLINE_MSG }), 'red');
        return false;
      }
      termPush(id, 'user', text);
      const ok = await sendFollowup(id, text, 'follow-up');
      if (ok) patch(id, (p) => ({ ...p, mission: p.mission ?? a.mission }));
      return ok;
    },
    [cloud.info.phase, flash, termPush, sendFollowup, patch],
  );

  const actApprove = useCallback(
    (id: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      if (!a.cloudId) return localApprove(id);
      if (cloud.info.phase === 'offline') return offlineFallback(id, 'approval', () => localApprove(id));
      setConfirm({
        title: `APPROVE PLAN · ${a.name}?`,
        tone: 'amber',
        confirmLabel: 'Send "Approved, proceed."',
        body: (
          <>
            This sends the follow-up <b>“Approved, proceed.”</b> to cloud agent <code>{a.cloudId}</code>. The agent starts a new run, which uses
            your Cursor usage.
          </>
        ),
        onConfirm: () => {
          termPush(id, 'user', 'Approved, proceed.');
          void sendFollowup(id, 'Approved, proceed.', 'plan approval').then((ok) => ok && setApprovals((n) => n + 1));
        },
      });
    },
    [cloud.info.phase, localApprove, offlineFallback, sendFollowup, termPush],
  );

  const doStop = useCallback(
    async (id: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      const cid = a?.cloudId;
      if (!a || !cid) return;
      setBusy(id, true);
      termPush(id, 'tool', `uplink.stop(${cid.slice(0, 15)}…)`);
      const r = await cloud.stop(cid);
      setBusy(id, false);
      if (r.ok) {
        termPush(id, 'warn', 'RETREAT · stop order acknowledged by the cloud agent');
        termPush(id, 'sys', 'send a follow-up (ASSIGN) to put it back to work');
        feedLog(a.name, 'RETREAT · cloud agent stopped', 'warn');
        flash(`Stop sent to ${a.name}. Cursor may show it as running for a few more seconds.`, 'amber');
        sfx.retreat();
        say(VOICE.retreat);
      } else if (r.status === 503) {
        offlineFallback(id, 'stop', () => localRetreat(id));
      } else {
        termPush(id, 'err', `stop failed · ${r.status ? `HTTP ${r.status} · ` : ''}${r.error}`);
        if (r.status === 409) termPush(id, 'sys', 'nothing to stop: the agent is not currently running');
        feedLog(a.name, `RETREAT FAILED: ${r.error}`, 'warn');
        flash(`Could not stop ${a.name}. ${friendlyError(r)}`, 'red');
        sfx.error();
      }
    },
    [cloud, termPush, feedLog, flash, setBusy, offlineFallback, localRetreat],
  );

  const actRetreat = useCallback(
    (id: string) => {
      const a = agentsRef.current.find((x) => x.id === id);
      if (!a) return;
      if (!a.cloudId) return localRetreat(id);
      if (cloud.info.phase === 'offline') return offlineFallback(id, 'stop', () => localRetreat(id));
      const v1 = cloud.info.apiVersion === 'v1';
      setConfirm({
        title: `STOP ${a.name}? (RETREAT)`,
        tone: 'red',
        confirmLabel: 'Stop agent',
        body: (
          <>
            This sends a real <b>stop</b> order to cloud agent <code>{a.cloudId}</code>.
            <br />
            {v1
              ? 'The active run is cancelled (that run cannot be resumed). A follow-up starts a fresh run on the same agent.'
              : 'The agent halts its current work without being deleted. A follow-up (ASSIGN) puts it back to work.'}
          </>
        ),
        onConfirm: () => void doStop(id),
      });
    },
    [cloud.info.phase, cloud.info.apiVersion, localRetreat, offlineFallback, doStop],
  );

  const launchSeq = useRef(0);
  const actLaunch = useCallback(
    async ({ prompt, repo, ref, model }: LaunchSpec) => {
      // Instant feedback: a RUNNING placeholder warps in while the API call is in flight.
      const ghostId = `warp-${++launchSeq.current}`;
      const ghost: Agent = {
        id: ghostId,
        name: 'CLOUD-····',
        mission: clip(prompt, 60),
        status: 'RUNNING',
        activity: 'Launching · contacting Cursor Cloud…',
        progress: 3,
        classLabel: 'CLOUD',
        role: 'Live',
        hp: 100,
        tokens: 100,
        x: 46 + Math.random() * 8,
        y: 46 + Math.random() * 8,
        pending: true,
      };
      setSummonBusy(true);
      setSummonError(null);
      setLastLaunch({ prompt, repo, ref, model });
      setRecentRepos((r) => [repo, ...r.filter((x) => x !== repo)].slice(0, 8));
      setSummonOpen(false);
      setPending((p) => [...p, ghost]);
      setSelectedId(ghostId);
      setArriving(new Set([ghostId]));
      sfx.warp();
      window.setTimeout(() => termPush(ghostId, 'uplink', `uplink.launch(${repo.replace(/^https?:\/\//, '')}@${ref}) · awaiting agent id…`), 40);
      const r = await cloud.launch(prompt, repo, ref, model);
      setSummonBusy(false);
      if (!r.ok) {
        const msg = friendlyError(r);
        setSummonError(msg);
        setPending((p) => p.map((g) => (g.id === ghostId ? { ...g, status: 'BLOCKED', activity: `Launch failed · ${msg}`, hp: 0 } : g)));
        window.setTimeout(() => setPending((p) => p.filter((g) => g.id !== ghostId)), 6000);
        feedLog('UPLINK', `launch failed: ${msg}`, 'warn');
        flash(`Launch failed. ${msg}`, 'red', { label: 'Edit & retry', run: () => setSummonOpen(true) });
        sfx.klaxon();
        return;
      }
      setLastLaunch(undefined);
      const a = r.data.agent;
      const name = callsignOf(a.id);
      noteSent(a.id, prompt);
      setPending((p) => p.filter((g) => g.id !== ghostId));
      setSelectedId(a.id);
      setCockpitId((c) => (c === ghostId || c === null ? a.id : c));
      setAssignOpen(false);
      setArriving(new Set([a.id]));
      window.setTimeout(() => setArriving(new Set()), 1500);
      say(`Cloud unit. ${VOICE.ready}`, { force: true });
      window.setTimeout(() => {
        termPush(a.id, 'uplink', `launched ${a.id} · ${repo.replace(/^https?:\/\//, '')}@${ref} · api ${r.data.apiVersion}`);
        termPush(a.id, 'user', clip(prompt));
        termPush(a.id, 'ok', `${name} warping in · status ${a.status || 'CREATING'} → RUNNING`);
        if (a.url) termPush(a.id, 'sys', a.url);
      }, 60);
      feedLog(name, `SUMMONED via uplink · ${clip(a.name || prompt, 60)}`, 'ok');
      flash(`Launched ${name} on ${repoShort(repo)}. Details are open on the right.`, 'green');
    },
    [cloud, termPush, feedLog, flash, noteSent],
  );

  const actDrill = useCallback(() => {
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
    sfx.warp();
    window.setTimeout(() => say(`${spoken(agent.name)}. ${VOICE.ready}`, { force: true }), 500);
    setArriving(new Set([id]));
    window.setTimeout(() => setArriving(new Set()), 1500);
    setSummonOpen(false);
  }, [addAgent, termPush, feedLog, flash]);

  const actSummon = useCallback(() => {
    sfx.tick();
    setSummonOpen(true);
  }, []);

  // Model list for the launch form (read-only GET, cached by the bridge). Fetched when the form opens.
  useEffect(() => {
    if (!summonOpen || cloud.info.phase !== 'online' || (models && !modelsError)) return;
    let alive = true;
    setModels(null);
    void uplink.models().then((r) => {
      if (!alive) return;
      if (r.ok) {
        setModels(r.data.models);
        setModelsError(null);
      } else {
        setModels([]);
        setModelsError(friendlyError(r));
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summonOpen, cloud.info.phase]);

  // Conversation loading state for the unit open in the detail panel.
  const focusCid = cloudIdOfUnit(cockpitId);
  useEffect(() => {
    if (focusCid && !convoState[focusCid] && cloud.info.phase === 'online') setConvoState((c) => ({ ...c, [focusCid]: { status: 'loading' } }));
  }, [focusCid, convoState, cloud.info.phase]);

  // ---------- search / filter ----------
  const visibleAgents = useMemo(() => activeAgents.filter((a) => matches(a, filter)), [activeAgents, filter]);
  const rosterCounts = useMemo(() => countsOf(activeAgents, filter), [activeAgents, filter]);
  const tableCounts = useMemo(() => countsOf(agents, filter), [agents, filter]);
  const tableAgents = useMemo(() => agents.filter((a) => matches(a, filter)), [agents, filter]);
  const realCount = useMemo(() => agents.filter((a) => a.cloudId).length, [agents]);
  const repoOptions = useMemo(() => {
    const seen = [...recentRepos];
    for (const a of Object.values(cloud.agents)) if (a.repo && /^https?:\/\//.test(a.repo) && !seen.includes(a.repo)) seen.push(a.repo);
    if (!seen.includes(DEFAULT_REPO)) seen.push(DEFAULT_REPO);
    return seen.slice(0, 12);
  }, [recentRepos, cloud.agents]);
  /** Station labels on the map: the repos your real agents work on (most common first). */
  const stations = useMemo(() => {
    const n: Record<string, number> = {};
    for (const a of Object.values(cloud.agents)) if (a.repo) n[repoShort(a.repo)] = (n[repoShort(a.repo)] ?? 0) + 1;
    const top = Object.entries(n)
      .sort((x, y) => y[1] - x[1])
      .map(([r]) => r);
    return top.length ? top.slice(0, 3) : undefined;
  }, [cloud.agents]);
  const refreshNow = useCallback(() => {
    void cloud.listNow().then((ok) => flash(ok ? 'Agent list refreshed' : 'Refresh failed, see the connection notice', ok ? 'green' : 'red'));
  }, [cloud, flash]);
  const toggleView = useCallback((v?: 'map' | 'list') => setView((cur) => v ?? (cur === 'map' ? 'list' : 'map')), []);

  const openCockpit = useCallback((id: string) => {
    sfx.select();
    setSelectedId(id);
    setCockpitId(id);
    setAssignOpen(false);
  }, []);

  const runCommand = useCallback(
    (cmd: CommandId) => {
      if (cmd === 'summon') return actSummon();
      const id = selectedId;
      if (!id) return flash('NO UNIT SELECTED');
      if (id.startsWith('warp-')) return flash('UNIT STILL WARPING IN · STAND BY');
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
          if (a.cloudId) {
            say('sys', 'real unit: assign / free text → follow-up prompt · approve → "Approved, proceed." · retreat → stop');
            say('sys', 'hold / resume only pause board updates locally');
          } else say('sys', 'anything else is relayed to the unit (simulated)');
          break;
        case 'status':
          say('out', `unit=${a.name} status=${a.status}${a.held ? ' (HOLD)' : ''} mission="${a.mission}"`);
          say('out', `progress=${a.progress}% hp=${a.hp}% tokens=${a.tokens}%`);
          if (a.live) say('uplink', `live state=${a.live.rawState} · ${a.live.url}`);
          if (a.cloudId) {
            say('uplink', `cmd uplink=${cloud.info.phase}${cloud.info.apiVersion ? ` (${cloud.info.apiVersion})` : ''} · agent ${a.cloudId}`);
            if (a.cloud) say('out', `raw=${a.cloud.rawStatus}${a.cloud.branch ? ` branch=${a.cloud.branch}` : ''}${a.cloud.prUrl ? ` pr=${a.cloud.prUrl}` : ''}`);
            if (a.cloudId) void cloud.refresh(a.cloudId);
          }
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
          if (a.cloudId && cloud.info.phase !== 'offline') {
            void sendFollowup(id, raw, 'console follow-up');
          } else if (a.cloudId) {
            say('err', OFFLINE_MSG);
            say('sys', 'add the key to .env.local, then try again (the bridge re-reads it within seconds)');
          } else if (a.live) {
            say('warn', 'local console only: this does not message the cloud agent');
            say('uplink', `open ${a.live.url} to talk to it directly`);
          } else {
            say('tool', `relay → ${a.name}: "${raw}"`);
            window.setTimeout(() => termPush(id, 'think', `ack, commander. folding "${raw}" into current plan`), 700);
          }
      }
    },
    [termPush, termClear, actHold, actApprove, actRetreat, actAssign, cloud, sendFollowup],
  );

  // ---------- keyboard ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      // Never steal keys while the user is typing.
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (summonOpen || confirm || helpOpen) return; // modal dialogs own the keyboard (they handle Esc)
      const k = e.key;
      const lower = k.toLowerCase();
      // Space / Enter on a focused button or link must press that control, not fire a board shortcut.
      if ((k === ' ' || k === 'Enter') && el && el.closest('button, a, [role="button"], [role="tab"], summary')) return;
      if (k === '?') {
        e.preventDefault();
        return setHelpOpen(true);
      }
      if (k === '/') {
        e.preventDefault();
        return searchRef.current?.focus();
      }
      if (lower === 'l') return toggleView();
      if (lower === 'm') return toggleMuted();
      if (lower === 'b') return toggleAmbient();
      if (lower === 't') {
        setWarRoomOpen(false);
        return setTerritoryOpen((o) => !o);
      }
      if (lower === 'w') {
        setTerritoryOpen(false);
        return setWarRoomOpen((o) => !o);
      }
      if (territoryOpen || warRoomOpen) return;
      if (k === 'Escape') {
        if (assignOpen) setAssignOpen(false);
        else setCockpitId(null);
        return;
      }
      const n = Number(k);
      if (Number.isInteger(n) && n >= 1 && n <= 9 && n <= visibleAgents.length) {
        const id = visibleAgents[n - 1].id;
        sfx.select();
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
  }, [visibleAgents, assignOpen, cockpitId, selectedId, openCockpit, runCommand, summonOpen, confirm, helpOpen, territoryOpen, warRoomOpen, toggleView]);

  const rosterToolbar = (
    <>
      <FilterBar filter={filter} onChange={setFilter} counts={rosterCounts} searchRef={view === 'map' ? searchRef : undefined} idPrefix="roster" compact />
      <ConnectionNotice uplink={cloud.info} realCount={realCount} now={now} onRefresh={refreshNow} onLaunch={actSummon} onHelp={() => setHelpOpen(true)} />
    </>
  );

  return (
    <div className={`fleet-command${cockpitAgent ? ' fleet-command--cockpit' : ''} fleet-command--${view}`}>
      <Map
        agents={activeAgents}
        selectedId={selectedId}
        onSelect={openCockpit}
        fog={{ territory: HOME_TERRITORY, touches: terr.touches[HOME_KEY], now }}
        bursts={bursts}
        stations={stations}
      />
      <MissionBanner
        left={<HudToolbar sound={false} view={view} onView={(v) => toggleView(v)} onHelp={() => setHelpOpen(true)} />}
        right={
          <HudToolbar
            onDemo={onDemo}
            onTerritory={() => (setWarRoomOpen(false), setTerritoryOpen((o) => !o))}
            onWarRoom={() => (setTerritoryOpen(false), setWarRoomOpen((o) => !o))}
            territoryOpen={territoryOpen}
            warRoomOpen={warRoomOpen}
          />
        }
      />

      {view === 'list' && (
        <FleetTable
          agents={tableAgents}
          archivedIds={archivedIds}
          selectedId={selectedId}
          filter={filter}
          onFilterChange={setFilter}
          counts={tableCounts}
          onOpen={openCockpit}
          onToggleArchive={archiveToggle}
          onArchiveFinished={archiveFinished}
          onLaunch={actSummon}
          onRefresh={refreshNow}
          onHelp={() => setHelpOpen(true)}
          uplink={cloud.info}
          now={now}
          searchRef={searchRef}
        />
      )}

      <div className="hud-column hud-column--left">
        <AgentList
          agents={visibleAgents}
          totalCount={activeAgents.length}
          selectedId={selectedId}
          onSelect={openCockpit}
          archived={archivedUnits}
          onRecall={(id) => archiveToggle(id)}
          departing={departing}
          arriving={arriving}
          toolbar={rosterToolbar}
          now={now}
          empty={
            filterActive(filter) ? (
              <>
                No agents match these filters.
                <button type="button" className="link-btn" onClick={() => setFilter({ ...EMPTY_FILTER })}>
                  Clear filters
                </button>
              </>
            ) : (
              <>
                No active agents.
                <button type="button" className="link-btn" onClick={actSummon}>
                  Launch one
                </button>
              </>
            )
          }
        />
        <ActivityFeed entries={feed} />
        <Minimap
          agents={activeAgents}
          selectedId={selectedId}
          territory={HOME_TERRITORY}
          touches={terr.touches[HOME_KEY]}
          now={now}
          onOpenTerritory={() => setTerritoryOpen(true)}
        />
      </div>

      <div className="hud-column hud-column--right">
        <MissionStatus progress={missionProgress} />
        <BurnMeter agents={activeAgents} cloudTokens={intel.totalTokens} />
        <NoticeBoard
          liveAgent={agents.find((a) => a.live)}
          liveError={liveError}
          uplink={cloud.info}
          realCount={agents.filter((a) => a.cloudId && (a.cloud || !a.live)).length}
        />
      </div>

      {cockpitAgent && (
        <Cockpit
          agent={cockpitAgent}
          override={overrides[cockpitAgent.id]}
          lines={logs[cockpitAgent.id] ?? []}
          link={cockpitAgent.cloudId ? (liveLink ?? { state: 'ended' }) : undefined}
          uplink={cloud.info}
          busy={busyIds.has(cockpitAgent.id)}
          assignOpen={assignOpen}
          onAssignOpenChange={setAssignOpen}
          onClose={() => (setCockpitId(null), setAssignOpen(false))}
          onHoldToggle={() => actHold(cockpitAgent.id)}
          onAssign={(m) => actAssign(cockpitAgent.id, m)}
          onRetreat={() => actRetreat(cockpitAgent.id)}
          onApprove={() => actApprove(cockpitAgent.id)}
          onTerminalSubmit={(v) => onTerminalSubmit(cockpitAgent.id, v)}
          onArchive={cockpitAgent.pending ? undefined : () => archiveToggle(cockpitAgent.id)}
          archived={archivedIds.has(cockpitAgent.id)}
          messages={cockpitAgent.cloudId ? convo[cockpitAgent.cloudId] : undefined}
          convo={cockpitAgent.cloudId ? convoState[cockpitAgent.cloudId] : undefined}
          onSendFollowup={cockpitAgent.cloudId ? (t) => actSendFollowup(cockpitAgent.id, t) : undefined}
          now={now}
        />
      )}

      {territoryOpen && (
        <TerritoryOverlay territories={territories} touches={terr.touches} agents={activeAgents} now={now} onClose={() => setTerritoryOpen(false)} />
      )}
      {warRoomOpen && (
        <WarRoom
          lanes={history.lanes}
          start={history.start}
          now={now}
          cloudRuns={cloudRuns}
          onClose={() => setWarRoomOpen(false)}
          onOpen={(id) => (setWarRoomOpen(false), openCockpit(id))}
        />
      )}

      <CommandBar
        selected={selected}
        onCommand={runCommand}
        onOpenCockpit={() => selectedId && openCockpit(selectedId)}
        uplink={cloud.info}
        onHelp={() => setHelpOpen(true)}
      />

      {summonOpen && (
        <SummonDialog
          uplink={cloud.info}
          busy={summonBusy}
          error={summonError}
          onLaunch={(spec) => void actLaunch(spec)}
          onDrill={actDrill}
          initial={lastLaunch}
          models={models}
          modelsError={modelsError}
          repoOptions={repoOptions}
          onClose={() => !summonBusy && setSummonOpen(false)}
        />
      )}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
      {helpOpen && <HelpOverlay onClose={() => setHelpOpen(false)} />}

      <Toasts items={toasts} onDismiss={dismissToast} />

      <div className="crt-overlay" aria-hidden />
      <div className="crt-flicker" aria-hidden />
    </div>
  );
}
