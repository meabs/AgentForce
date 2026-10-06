import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Agent } from '../types';
import type { CloudAgent } from '../lib/uplink';
import { uplink } from '../lib/uplink';
import { mapCursorState } from './useCursorLive';
import {
  HOME_DISTRICT,
  HOME_KEY,
  HOME_TERRITORY,
  agentColor,
  buildTerritory,
  extractPaths,
  repoKeyOf,
  repoLabel,
  resolvePath,
  type Territory,
  type TouchMap,
} from '../lib/territory';
import { sfx } from '../lib/sfx';
import { callsignOf } from '../lib/callsign';

export interface Focus {
  x: number;
  y: number;
  path: string;
  at: number;
}

export interface TerritoryApi {
  touches: TouchMap;
  focus: Record<string, Focus>;
  touch: (key: string, paths: string[], agent: { id: string; name: string }, kind?: 'read' | 'edit', at?: number) => number;
  reset: () => void;
}

/** Touch state shared by the live HUD and the demo director. */
export function useTerritoryState(opts: { revealSound?: boolean } = {}): TerritoryApi {
  const [touches, setTouches] = useState<TouchMap>({});
  const [focus, setFocus] = useState<Record<string, Focus>>({});
  const touchesRef = useRef(touches);
  touchesRef.current = touches;
  const soundRef = useRef(opts.revealSound);
  soundRef.current = opts.revealSound;
  const tileLookup = useRef<(key: string, path: string) => { x: number; y: number } | undefined>(() => undefined);

  const touch = useCallback<TerritoryApi['touch']>((key, paths, agent, kind = 'read', at = Date.now()) => {
    if (!paths.length) return 0;
    const prevRepo = touchesRef.current[key] ?? {};
    let fresh = 0;
    const repo = { ...prevRepo };
    for (const p of paths) {
      const old = repo[p];
      if (!old) fresh++;
      if (old && old.at > at) continue;
      repo[p] = {
        agentId: agent.id,
        name: agent.name,
        color: agentColor(agent.id),
        at,
        count: (old?.count ?? 0) + 1,
        kind: old?.kind === 'edit' ? 'edit' : kind,
      };
    }
    const next = { ...touchesRef.current, [key]: repo };
    touchesRef.current = next;
    setTouches(next);
    if (key === HOME_KEY) {
      const last = paths[paths.length - 1];
      const t = HOME_TERRITORY.byPath[last] ?? tileLookup.current(key, last);
      if (t) setFocus((f) => ({ ...f, [agent.id]: { x: t.x, y: t.y, path: last, at } }));
    }
    if (fresh && soundRef.current) sfx.reveal();
    return fresh;
  }, []);

  const reset = useCallback(() => {
    touchesRef.current = {};
    setTouches({});
    setFocus({});
  }, []);

  return { touches, focus, touch, reset };
}

// ---------------------------------------------------------------- simulated explorers (live HUD)

const EXPLORE_MS = 1300;

/** Simulated units walk their home districts file by file, lighting tiles as they go. */
export function useMockExplorers(agents: Agent[], touch: TerritoryApi['touch']) {
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const cursor = useRef<Record<string, number>>({});
  useEffect(() => {
    const files = HOME_TERRITORY.files;
    const byDir = (dirs: string[]) => files.filter((f) => dirs.includes(HOME_TERRITORY.byPath[f].dir));
    const pools: Record<string, string[]> = {};
    const timer = window.setInterval(() => {
      for (const a of agentsRef.current) {
        if (a.cloudId && a.id !== 'cursor-7') continue;
        if (a.held || a.status !== 'RUNNING') continue;
        if (a.id === 'cursor-7' && a.live) continue; // real live unit: no fake intel
        const dirs = HOME_DISTRICT[a.id] ?? HOME_DISTRICT[a.id.replace(/-\d+$/, '')] ?? [HOME_TERRITORY.districts[a.name.length % HOME_TERRITORY.districts.length].dir];
        const pool = (pools[a.id] ??= byDir(dirs));
        if (!pool.length) continue;
        const i = (cursor.current[a.id] ?? Math.floor(Math.random() * pool.length)) % pool.length;
        cursor.current[a.id] = i + 1 + (Math.random() < 0.25 ? 1 : 0);
        touch(HOME_KEY, [pool[i]], a, Math.random() < 0.3 ? 'edit' : 'read');
      }
    }, EXPLORE_MS);
    return () => window.clearInterval(timer);
  }, [touch]);
}

// ---------------------------------------------------------------- real intel (read-only)

export interface AgentIntel {
  id: string;
  repoKey: string;
  repo?: string;
  paths: string[];
  tokens: number;
  messages: number;
  updatedAt?: string;
}

const TREE_CACHE = 'afc.trees.v1';
const IGNORE_RE = /(^|\/)(node_modules|dist|build|\.next|vendor|coverage|__pycache__|\.venv)\//;
const BIN_RE = /\.(png|jpe?g|gif|webp|ico|mp4|webm|mov|zip|gz|tgz|pdf|woff2?|ttf|otf|mp3|wav|bin|exe|dll|so)$/i;

function readTreeCache(): Record<string, string[] | null> {
  try {
    return JSON.parse(sessionStorage.getItem(TREE_CACHE) ?? '{}');
  } catch {
    return {};
  }
}

/** Public GitHub repos: fetch the file tree once (anonymous, read-only) so the fog covers the whole repo. */
async function fetchGithubTree(repoUrl: string, ref?: string): Promise<string[] | null> {
  const m = repoKeyOf(repoUrl).match(/^github\.com\/([\w.-]+)\/([\w.-]+)$/);
  if (!m) return null;
  try {
    const r = await fetch(`https://api.github.com/repos/${m[1]}/${m[2]}/git/trees/${encodeURIComponent(ref || 'HEAD')}?recursive=1`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const files: string[] = (Array.isArray(d.tree) ? d.tree : [])
      .filter((n: { type: string; path: string }) => n.type === 'blob' && !IGNORE_RE.test(n.path) && !BIN_RE.test(n.path))
      .map((n: { path: string }) => n.path);
    return files.length ? files.slice(0, 1000) : null;
  } catch {
    return null;
  }
}

/**
 * Builds a territory per real repo from what cloud agents actually said (summary + transcript),
 * all via read-only GETs on the local bridge. Never launches, follows up or stops anything.
 */
export function useRepoIntel(cloudAgents: Record<string, CloudAgent>, online: boolean, touch: TerritoryApi['touch']) {
  const [intel, setIntel] = useState<Record<string, AgentIntel>>({});
  const [trees, setTrees] = useState<Record<string, string[] | null>>(readTreeCache);
  const doneRef = useRef<Record<string, string>>({});
  const busyRef = useRef(false);
  const treesRef = useRef(trees);
  treesRef.current = trees;
  const agentsRef = useRef(cloudAgents);
  agentsRef.current = cloudAgents;

  // conversation sweep: one agent at a time, re-read only when updatedAt changes
  useEffect(() => {
    if (!online) return;
    let alive = true;
    const step = async () => {
      if (busyRef.current) return;
      const todo = Object.values(agentsRef.current)
        .filter((a) => doneRef.current[a.id] !== (a.updatedAt ?? a.status))
        .sort((a, b) => Date.parse(b.updatedAt ?? '') - Date.parse(a.updatedAt ?? ''))
        .slice(0, 1);
      const a = todo[0];
      if (!a) return;
      busyRef.current = true;
      try {
        const r = await uplink.conversation(a.id);
        if (!alive) return;
        doneRef.current[a.id] = a.updatedAt ?? a.status;
        const msgs = r.ok ? r.data.messages : [];
        const text = [a.summary ?? '', a.name ?? '', ...msgs.map((m) => m.text)].join('\n');
        const paths = extractPaths(text);
        const chars = msgs.reduce((s, m) => s + m.text.length, 0) + (a.summary?.length ?? 0);
        const repoKey = repoKeyOf(a.repo);
        setIntel((p) => ({
          ...p,
          [a.id]: { id: a.id, repoKey, repo: a.repo, paths, tokens: Math.round(chars / 4), messages: msgs.length, updatedAt: a.updatedAt },
        }));
        if (a.repo && repoKey.startsWith('github.com/') && !(repoKey in treesRef.current)) {
          const tree = await fetchGithubTree(a.repo.startsWith('http') ? a.repo : `https://${a.repo}`, a.ref);
          if (!alive) return;
          setTrees((t) => {
            const n = { ...t, [repoKey]: tree };
            try {
              sessionStorage.setItem(TREE_CACHE, JSON.stringify(n));
            } catch {
              /* quota: fine */
            }
            return n;
          });
        }
      } finally {
        busyRef.current = false;
      }
    };
    void step();
    const t = window.setInterval(() => void step(), 1500);
    return () => {
      alive = false;
      window.clearInterval(t);
    };
  }, [online]);

  const territories: Territory[] = useMemo(() => {
    const byRepo: Record<string, { repo?: string; paths: Set<string> }> = {};
    for (const i of Object.values(intel)) {
      if (!i.repo) continue;
      const g = (byRepo[i.repoKey] ??= { repo: i.repo, paths: new Set() });
      i.paths.forEach((p) => g.paths.add(p));
    }
    return Object.entries(byRepo)
      .map(([key, g]) => {
        const tree = trees[key];
        if (tree && tree.length) return buildTerritory(key, repoLabel(g.repo), tree, { repo: g.repo, complete: true });
        if (!g.paths.size) return null;
        return buildTerritory(key, repoLabel(g.repo), [...g.paths], { repo: g.repo, complete: false });
      })
      .filter((t): t is Territory => !!t)
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [intel, trees]);

  // push real touches whenever intel or a repo tree lands
  const pushed = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const t of territories) {
      for (const i of Object.values(intel)) {
        if (i.repoKey !== t.key) continue;
        const sig = `${t.key}|${t.files.length}|${i.updatedAt}|${i.paths.length}`;
        if (pushed.current[i.id] === sig) continue;
        pushed.current[i.id] = sig;
        const resolved = i.paths.map((p) => resolvePath(t, p)).filter((p): p is string => !!p);
        const a = agentsRef.current[i.id];
        const name = callsignOf(i.id);
        const at = Date.parse(i.updatedAt ?? '') || Date.now();
        const st = mapCursorState(a?.status);
        touch(t.key, resolved, { id: i.id, name }, st === 'RUNNING' ? 'read' : 'edit', at);
      }
    }
  }, [territories, intel, touch]);

  const totalTokens = useMemo(() => Object.values(intel).reduce((s, i) => s + i.tokens, 0), [intel]);
  return { intel, territories, totalTokens };
}
