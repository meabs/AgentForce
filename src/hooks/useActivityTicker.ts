import { useEffect, useRef, useState } from 'react';
import type { ActivityEntry, Agent } from '../types';
import {
  ACTIVITY_LINES,
  FEED_EVENTS,
  INITIAL_AGENTS,
  STATUS_CYCLE,
} from '../data/mockAgents';

const TICK_MS = 2600;
const MAX_FEED = 48;

function nextLine(agentId: string, tick: number): string {
  const lines = ACTIVITY_LINES[agentId] ?? ['Standing by…'];
  return lines[tick % lines.length];
}

function nextStatus(agentId: string, tick: number): Agent['status'] {
  const cycle = STATUS_CYCLE[agentId];
  if (!cycle) return 'IDLE';
  return cycle[tick % cycle.length];
}

export function useActivityTicker() {
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [feed, setFeed] = useState<ActivityEntry[]>([]);
  const tickRef = useRef(0);
  const idRef = useRef(0);

  useEffect(() => {
    const seed: ActivityEntry[] = FEED_EVENTS.map((e, i) => ({
      id: `seed-${i}`,
      timestamp: Date.now() - (FEED_EVENTS.length - i) * 1400,
      agentName: e.agentName,
      message: e.message,
      kind: e.kind,
    }));
    setFeed([...seed].reverse());

    const timer = window.setInterval(() => {
      tickRef.current += 1;
      const t = tickRef.current;

      setAgents((prev) => {
        const next = prev.map((agent, index) => {
          const activity = nextLine(agent.id, t + index);
          const status = nextStatus(agent.id, Math.floor(t / 2) + index);
          const driftX = Math.sin(t * 0.35 + index) * 0.18;
          const driftY = Math.cos(t * 0.28 + index) * 0.14;
          const progressBase = agent.progress;
          const wobble = Math.round(Math.sin(t * 0.5 + index) * 4);
          return {
            ...agent,
            activity,
            status,
            progress: Math.min(98, Math.max(8, progressBase + wobble)),
            x: Math.min(82, Math.max(18, agent.x + driftX)),
            y: Math.min(72, Math.max(28, agent.y + driftY)),
          };
        });

        const evt = FEED_EVENTS[t % FEED_EVENTS.length];
        const speaker = next[t % next.length];
        idRef.current += 1;
        const entry: ActivityEntry = {
          id: `evt-${idRef.current}`,
          timestamp: Date.now(),
          agentName: speaker.name,
          message: t % 2 === 0 ? speaker.activity : evt.message,
          kind: t % 2 === 0 ? (speaker.status === 'BLOCKED' ? 'warn' : 'info') : evt.kind,
        };
        setFeed((prevFeed) => [entry, ...prevFeed].slice(0, MAX_FEED));
        return next;
      });
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  return { agents, feed };
}
