import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent, AgentOverride, TermKind, TermLine } from '../types';
import type { CursorLive } from './useCursorLive';
import { GENERIC_SCRIPT, IDLE_LINES, RUN_SCRIPTS, kindOf } from '../data/terminalScripts';

const STEP_MS = 1100;
const MAX_LINES = 220;

let seq = 0;
const mk = (kind: TermKind, text: string): TermLine => ({ id: `tl-${++seq}`, t: Date.now(), kind, text });

/**
 * Per-agent simulated terminal transcripts. Held agents stop streaming.
 * CURSOR-7 (when the live file is present) streams uplink lines instead of a fake script.
 */
export function useTerminalLogs(
  agents: Agent[],
  overrides: Record<string, AgentOverride>,
  live: CursorLive | null,
) {
  const [logs, setLogs] = useState<Record<string, TermLine[]>>({});
  const cursorRef = useRef<Record<string, number>>({});
  const agentsRef = useRef(agents);
  const ovRef = useRef(overrides);
  const liveRef = useRef(live);
  agentsRef.current = agents;
  ovRef.current = overrides;
  liveRef.current = live;
  const tickRef = useRef(0);

  const push = useCallback((agentId: string, kind: TermKind, text: string) => {
    setLogs((prev) => ({ ...prev, [agentId]: [...(prev[agentId] ?? []), mk(kind, text)].slice(-MAX_LINES) }));
  }, []);

  const clear = useCallback((agentId: string) => {
    setLogs((prev) => ({ ...prev, [agentId]: [mk('sys', 'terminal cleared')] }));
  }, []);

  // Seed each agent's history once (no typing animation for these: they're "old").
  useEffect(() => {
    setLogs((prev) => {
      const next = { ...prev };
      for (const a of agents) {
        if (next[a.id]) continue;
        if (a.id.startsWith('bc')) {
          // Real cloud unit: no fake history, the uplink streams its transcript.
          next[a.id] = [mk('sys', `session attached · ${a.name} · ${a.id} · command uplink`)];
          continue;
        }
        const script = RUN_SCRIPTS[a.id] ?? GENERIC_SCRIPT;
        const seedCount = RUN_SCRIPTS[a.id] ? 5 : 2;
        cursorRef.current[a.id] = seedCount;
        const old = Date.now() - 60_000;
        next[a.id] = [
          { ...mk('sys', `session attached · ${a.name} · uplink secure`), t: old },
          ...script.slice(0, seedCount).map((l) => {
            const { kind, text } = kindOf(l);
            return { ...mk(kind, text), t: old };
          }),
        ];
      }
      return next;
    });
  }, [agents]);

  // Live uplink lines for CURSOR-7.
  const lastLiveKey = useRef<string>('');
  useEffect(() => {
    if (!live) return;
    const key = `${live.updatedAt}|${live.state}|${live.summary}`;
    if (key === lastLiveKey.current) return;
    const first = lastLiveKey.current === '';
    lastLiveKey.current = key;
    if (first) push('cursor-7', 'uplink', `uplink ${live.id} · ${live.url}`);
    push('cursor-7', 'uplink', `state=${live.state.toUpperCase()} · updated ${new Date(live.updatedAt).toLocaleTimeString('en-GB')}`);
    if (live.title) push('cursor-7', 'out', `mission: ${live.title}`);
    if (live.summary) push('cursor-7', 'think', live.summary);
  }, [live, push]);

  // Stream simulated lines.
  useEffect(() => {
    const timer = window.setInterval(() => {
      tickRef.current += 1;
      const t = tickRef.current;
      const additions: Record<string, TermLine[]> = {};
      for (const a of agentsRef.current) {
        const ov = ovRef.current[a.id];
        if (ov?.held) continue;
        if (a.id.startsWith('bc')) continue; // real units: transcript comes from the uplink
        if (a.id === 'cursor-7' && liveRef.current) {
          if (t % 8 === 0) {
            const L = liveRef.current;
            const age = Math.max(0, Math.round((Date.now() - Date.parse(L.updatedAt)) / 1000));
            additions[a.id] = [mk('uplink', `⟳ poll /cursor-live.json · state=${L.state.toUpperCase()} · ${age}s since update`)];
          }
          continue;
        }
        const chance = a.status === 'RUNNING' ? 0.75 : a.status === 'BLOCKED' ? 0.35 : 0.1;
        if (Math.random() > chance) continue;
        let line: string;
        if (a.status === 'IDLE') {
          line = IDLE_LINES[t % IDLE_LINES.length];
          additions[a.id] = [mk('sys', line)];
          continue;
        }
        const script = RUN_SCRIPTS[a.id] ?? GENERIC_SCRIPT;
        const i = cursorRef.current[a.id] ?? 0;
        line = script[i % script.length];
        cursorRef.current[a.id] = i + 1;
        const { kind, text } = kindOf(line);
        additions[a.id] = [mk(kind, text)];
      }
      if (Object.keys(additions).length) {
        setLogs((prev) => {
          const next = { ...prev };
          for (const [id, lines] of Object.entries(additions)) next[id] = [...(next[id] ?? []), ...lines].slice(-MAX_LINES);
          return next;
        });
      }
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, []);

  return { logs, push, clear };
}
