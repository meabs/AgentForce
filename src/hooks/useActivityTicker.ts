import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActivityEntry, Agent } from '../types';
import { ACTIVITY_LINES, FEED_EVENTS, INITIAL_AGENTS, STATUS_CYCLE } from '../data/mockAgents';

const TICK_MS = 2600;
const MAX_FEED = 48;
const GENERIC_LINES = [
  'Calibrating sensors…',
  'Syncing workspace index…',
  'Reading task brief…',
  'Probing build pipeline…',
  'Drafting execution plan…',
];
const GENERIC_CYCLE: Agent['status'][] = ['IDLE', 'RUNNING', 'RUNNING', 'RUNNING'];

function nextLine(agentId: string, tick: number): string {
  const lines = ACTIVITY_LINES[agentId] ?? GENERIC_LINES;
  return lines[tick % lines.length];
}

function nextStatus(agentId: string, tick: number): Agent['status'] {
  const cycle = STATUS_CYCLE[agentId] ?? GENERIC_CYCLE;
  return cycle[tick % cycle.length];
}

/**
 * Simulated fleet chatter. Agents whose id is in `paused` are frozen
 * (no activity/status/position updates, no feed lines).
 */
export function useActivityTicker(paused: ReadonlySet<string>) {
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const agentsRef = useRef<Agent[]>(INITIAL_AGENTS);
  const [feed, setFeed] = useState<ActivityEntry[]>([]);
  const tickRef = useRef(0);
  const idRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

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

      {
        const prev = agentsRef.current;
        const next = prev.map((agent, index) => {
          if (pausedRef.current.has(agent.id)) return agent;
          const wobble = Math.round(Math.sin(t * 0.5 + index) * 4);
          return {
            ...agent,
            activity: nextLine(agent.id, t + index),
            status: nextStatus(agent.id, Math.floor(t / 2) + index),
            progress: Math.min(98, Math.max(8, agent.progress + wobble)),
            x: Math.min(82, Math.max(18, agent.x + Math.sin(t * 0.35 + index) * 0.18)),
            y: Math.min(72, Math.max(28, agent.y + Math.cos(t * 0.28 + index) * 0.14)),
          };
        });

        const active = next.filter((a) => !pausedRef.current.has(a.id));
        if (active.length) {
          const evt = FEED_EVENTS[t % FEED_EVENTS.length];
          const speaker = active[t % active.length];
          const useSpeaker = t % 2 === 0 || !active.some((a) => a.name === evt.agentName);
          idRef.current += 1;
          const entry: ActivityEntry = {
            id: `evt-${idRef.current}`,
            timestamp: Date.now(),
            agentName: useSpeaker ? speaker.name : evt.agentName,
            message: useSpeaker ? speaker.activity : evt.message,
            kind: useSpeaker ? (speaker.status === 'BLOCKED' ? 'warn' : 'info') : evt.kind,
          };
          setFeed((prevFeed) => [entry, ...prevFeed].slice(0, MAX_FEED));
        }
        agentsRef.current = next;
        setAgents(next);
      }
    }, TICK_MS);

    return () => window.clearInterval(timer);
  }, []);

  const addAgent = useCallback((agent: Agent) => {
    if (agentsRef.current.some((a) => a.id === agent.id)) return;
    agentsRef.current = [...agentsRef.current, agent];
    setAgents(agentsRef.current);
  }, []);

  return { agents, feed, addAgent };
}
