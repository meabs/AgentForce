import { useEffect, useMemo, useState } from 'react';
import { MissionBanner } from './components/MissionBanner';
import { AgentList } from './components/AgentList';
import { ActivityFeed } from './components/ActivityFeed';
import { Map } from './components/Map';
import { Minimap } from './components/Minimap';
import { MissionStatus } from './components/MissionStatus';
import { ResourcePanel } from './components/ResourcePanel';
import { NoticeBoard } from './components/NoticeBoard';
import { CommandBar } from './components/CommandBar';
import { useActivityTicker } from './hooks/useActivityTicker';
import { mapCursorState, useCursorLive } from './hooks/useCursorLive';
import type { ActivityEntry, Agent } from './types';
import './App.css';

export default function App() {
  const { agents: mockAgents, feed: mockFeed } = useActivityTicker();
  const { live, error: liveError } = useCursorLive();
  const [liveFeed, setLiveFeed] = useState<ActivityEntry[]>([]);

  // Override CURSOR-7 with the live cloud-agent file when present.
  const agents: Agent[] = useMemo(
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

  // Emit a feed line whenever the live file changes.
  useEffect(() => {
    if (!live) return;
    setLiveFeed((prev) =>
      [
        {
          id: `live-${live.updatedAt}-${live.state}`,
          timestamp: Date.parse(live.updatedAt) || Date.now(),
          agentName: live.name || 'CURSOR-7',
          message: `[LIVE ${live.state.toUpperCase()}] ${live.summary}`,
          kind: (mapCursorState(live.state) === 'BLOCKED' ? 'warn' : mapCursorState(live.state) === 'IDLE' ? 'ok' : 'info') as ActivityEntry['kind'],
        },
        ...prev,
      ].slice(0, 10),
    );
  }, [live]);

  // Mock ticker lines for CURSOR-7 are suppressed while the live feed is active.
  const feed = useMemo(() => {
    const base = live ? mockFeed.filter((e) => e.agentName !== 'CURSOR-7') : mockFeed;
    return [...liveFeed, ...base].sort((x, y) => y.timestamp - x.timestamp).slice(0, 48);
  }, [mockFeed, liveFeed, live]);
  const [selectedId, setSelectedId] = useState<string | null>('cursor-7');
  const [toast, setToast] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 2600);
    return () => window.clearInterval(t);
  }, []);

  const selected = useMemo(() => agents.find((a) => a.id === selectedId), [agents, selectedId]);
  const missionProgress = 62 + (tick % 6);
  const cpu = 41 + Math.round(Math.sin(tick * 0.7) * 6);
  const mem = 58 + Math.round(Math.cos(tick * 0.5) * 4);
  const net = 27 + Math.round(Math.sin(tick * 0.9) * 8);

  const handleCommand = (cmd: string) => {
    setToast(`${cmd} → ${selected?.name ?? 'FLEET'} · ACK (stub)`);
    window.setTimeout(() => setToast(null), 1800);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= agents.length) setSelectedId(agents[n - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [agents]);

  return (
    <div className="fleet-command">
      <Map agents={agents} selectedId={selectedId} onSelect={setSelectedId} />
      <MissionBanner />

      <div className="hud-column hud-column--left">
        <AgentList agents={agents} selectedId={selectedId} onSelect={setSelectedId} />
        <ActivityFeed entries={feed} />
        <Minimap agents={agents} selectedId={selectedId} />
      </div>

      <div className="hud-column hud-column--right">
        <MissionStatus progress={missionProgress} />
        <ResourcePanel cpu={cpu} mem={mem} net={net} />
        <NoticeBoard liveAgent={agents.find((a) => a.live)} liveError={liveError} />
      </div>

      <CommandBar selected={selected} onCommand={handleCommand} />

      {toast && <div className="cmd-toast">{toast}</div>}

      <div className="crt-overlay" aria-hidden />
      <div className="crt-flicker" aria-hidden />
    </div>
  );
}
