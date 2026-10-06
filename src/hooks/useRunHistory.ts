import { useEffect, useRef, useState } from 'react';
import type { Agent, AgentStatus } from '../types';
import { agentColor } from '../lib/territory';

export interface Seg {
  s: AgentStatus;
  from: number;
  to?: number;
}

export interface Lane {
  id: string;
  name: string;
  color: string;
  mission: string;
  real: boolean;
  segs: Seg[];
  cloud?: { createdAt?: string; updatedAt?: string; rawStatus: string; repo?: string; prUrl?: string };
}

/** Samples unit status once a second and keeps a per-unit segment timeline for the War Room. */
export function useRunHistory(agents: Agent[], resetKey = 0) {
  const [lanes, setLanes] = useState<Record<string, Lane>>({});
  const [start, setStart] = useState(() => Date.now());
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const lanesRef = useRef<Record<string, Lane>>({});

  useEffect(() => {
    lanesRef.current = {};
    setLanes({});
    setStart(Date.now());
    const sample = () => {
      const now = Date.now();
      const next = { ...lanesRef.current };
      let changed = false;
      for (const a of agentsRef.current) {
        const lane = next[a.id];
        const cloud = a.cloud ? { createdAt: undefined, updatedAt: a.cloud.updatedAt, rawStatus: a.cloud.rawStatus, repo: a.cloud.repo, prUrl: a.cloud.prUrl } : undefined;
        if (!lane) {
          next[a.id] = { id: a.id, name: a.name, color: agentColor(a.id), mission: a.mission, real: !!a.cloudId, segs: [{ s: a.status, from: now }], cloud };
          changed = true;
          continue;
        }
        const last = lane.segs[lane.segs.length - 1];
        if (last.s !== a.status || lane.mission !== a.mission || lane.name !== a.name) {
          const segs = last.s !== a.status ? [...lane.segs.slice(0, -1), { ...last, to: now }, { s: a.status, from: now }] : lane.segs;
          next[a.id] = { ...lane, name: a.name, mission: a.mission, segs: segs.slice(-80), cloud: cloud ?? lane.cloud };
          changed = true;
        }
      }
      if (changed) {
        lanesRef.current = next;
        setLanes(next);
      }
    };
    sample();
    const t = window.setInterval(sample, 1000);
    return () => window.clearInterval(t);
  }, [resetKey]);

  return { lanes, start };
}
