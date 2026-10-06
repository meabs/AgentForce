import { useCallback, useEffect, useRef, useState } from 'react';
import { mapCursorState } from './useCursorLive';
import { uplink, type CloudAgent, type CloudMessage, type UplinkResult } from '../lib/uplink';

const POLL_MS = 3000;
const LIST_EVERY_TICKS = 5; // ~15s
const MAX_LISTED_UNITS = 5;
const TOUCH_WINDOW_MS = 120_000;
const MAX_STATUS_PER_TICK = 6;

export type UplinkPhase = 'checking' | 'online' | 'offline' | 'error';

export interface UplinkInfo {
  phase: UplinkPhase;
  reason?: string;
  apiVersion?: string;
  checkedAt?: number;
  agentCount?: number;
}

interface Options {
  /** Cloud ids already represented by existing units (e.g. CURSOR-7's live id); always status-polled. */
  extraIds: string[];
  /** Cloud id currently open in the cockpit: its conversation is streamed. */
  focusId: string | null;
  /** Cloud ids on a local board HOLD: no polling, no board updates. */
  heldIds: ReadonlySet<string>;
  onMessages: (cloudId: string, msgs: CloudMessage[], first: boolean) => void;
}

/**
 * Polls the local LIVE COMMAND UPLINK bridge (/api/agents/*):
 *  - list every ~15s (roster discovery + uplink health)
 *  - status every ~3s for active / focused / recently commanded units
 *  - conversation every ~3s for the cockpit-focused unit (new messages only)
 */
export function useCloudAgents({ extraIds, focusId, heldIds, onMessages }: Options) {
  const [info, setInfo] = useState<UplinkInfo>({ phase: 'checking' });
  const [agents, setAgents] = useState<Record<string, CloudAgent>>({});
  const [listedIds, setListedIds] = useState<string[]>([]);
  const [summonedIds, setSummonedIds] = useState<string[]>([]);

  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const infoRef = useRef(info);
  infoRef.current = info;
  const optsRef = useRef({ extraIds, focusId, heldIds, onMessages });
  optsRef.current = { extraIds, focusId, heldIds, onMessages };
  const listedRef = useRef<string[]>([]);
  const summonedRef = useRef<string[]>([]);
  const touchedRef = useRef<Record<string, number>>({});
  const seenRef = useRef<Record<string, Set<string>>>({});
  /** Ids the API says don't exist (404): stop polling them. */
  const goneRef = useRef<Set<string>>(new Set());
  const tickRef = useRef(0);
  const busyRef = useRef(false);

  const noteFailure = useCallback((r: Extract<UplinkResult<unknown>, { ok: false }>) => {
    if (r.status === 503 || r.code === 'NO_API_KEY') {
      setInfo((p) => ({ ...p, phase: 'offline', reason: r.error, checkedAt: Date.now() }));
    } else if (r.status === 401 || r.status === 403 || r.status === 0 || r.code === 'BAD_RESPONSE') {
      setInfo((p) => ({ ...p, phase: 'error', reason: r.error, checkedAt: Date.now() }));
    }
  }, []);

  const upsert = useCallback((a: CloudAgent) => {
    if (optsRef.current.heldIds.has(a.id) && agentsRef.current[a.id]) return;
    setAgents((prev) => {
      const old = prev[a.id];
      if (old && old.status === a.status && old.summary === a.summary && old.updatedAt === a.updatedAt && old.name === a.name)
        return prev;
      const next = { ...prev, [a.id]: { ...old, ...a } };
      agentsRef.current = next;
      return next;
    });
  }, []);

  const doList = useCallback(async () => {
    const r = await uplink.list(Math.max(10, MAX_LISTED_UNITS * 2));
    if (!r.ok) {
      noteFailure(r);
      return false;
    }
    setInfo({ phase: 'online', apiVersion: r.data.apiVersion, checkedAt: Date.now(), agentCount: r.data.agents.length });
    for (const a of r.data.agents) upsert(a);
    const ids = r.data.agents.map((a) => a.id).slice(0, MAX_LISTED_UNITS);
    if (ids.join() !== listedRef.current.join()) {
      // keep previously listed units on the board (they don't vanish mid-session)
      const merged = [...listedRef.current, ...ids.filter((id) => !listedRef.current.includes(id))];
      listedRef.current = merged;
      setListedIds(merged);
    }
    return true;
  }, [noteFailure, upsert]);

  const refresh = useCallback(
    async (id: string) => {
      const r = await uplink.get(id);
      if (r.ok) upsert(r.data.agent);
      else if (r.status === 404) goneRef.current.add(id);
      else noteFailure(r);
      return r;
    },
    [noteFailure, upsert],
  );

  const pullConversation = useCallback(
    async (id: string) => {
      const r = await uplink.conversation(id);
      if (!r.ok) {
        if (r.status === 404) goneRef.current.add(id);
        else noteFailure(r);
        return;
      }
      const seen = seenRef.current[id];
      const first = !seen;
      const set = seen ?? new Set<string>();
      const fresh = r.data.messages.filter((m) => !set.has(m.id));
      fresh.forEach((m) => set.add(m.id));
      seenRef.current[id] = set;
      if (fresh.length || first) optsRef.current.onMessages(id, fresh, first);
    },
    [noteFailure],
  );

  // main poll loop
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (busyRef.current) return;
      busyRef.current = true;
      try {
        const t = tickRef.current++;
        const online = infoRef.current.phase === 'online';
        const listDue = t % LIST_EVERY_TICKS === 0;
        if (!online && !listDue) return; // offline: re-probe every ~15s, not every 3s
        if (listDue) {
          const ok = await doList();
          if (!ok || !alive) return;
        }
        const { extraIds: extra, focusId: focus, heldIds: held } = optsRef.current;
        const now = Date.now();
        const candidates = new Set<string>([...summonedRef.current, ...extra]);
        if (focus) candidates.add(focus);
        for (const [id, at] of Object.entries(touchedRef.current)) if (now - at < TOUCH_WINDOW_MS) candidates.add(id);
        for (const id of listedRef.current) {
          const a = agentsRef.current[id];
          if (a && mapCursorState(a.status) === 'RUNNING') candidates.add(id);
        }
        const ids = [...candidates].filter((id) => !held.has(id) && !goneRef.current.has(id)).slice(0, MAX_STATUS_PER_TICK);
        await Promise.all(ids.map((id) => refresh(id)));
        if (alive && focus && !held.has(focus) && !goneRef.current.has(focus) && infoRef.current.phase === 'online')
          await pullConversation(focus);
      } finally {
        busyRef.current = false;
      }
    };
    void tick();
    const timer = window.setInterval(() => void tick(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [doList, refresh, pullConversation]);

  // Pull the transcript immediately when the cockpit focus changes.
  useEffect(() => {
    if (focusId && infoRef.current.phase === 'online' && !heldIds.has(focusId) && !goneRef.current.has(focusId))
      void pullConversation(focusId);
  }, [focusId, heldIds, pullConversation]);

  const touch = useCallback((id: string) => {
    touchedRef.current[id] = Date.now();
  }, []);

  // ---------- commands ----------
  const launch = useCallback(
    async (prompt: string, repo: string, ref: string) => {
      const r = await uplink.launch(prompt, repo, ref);
      if (!r.ok) {
        noteFailure(r);
        return r;
      }
      const a = r.data.agent;
      upsert({ ...a, status: a.status && a.status !== 'UNKNOWN' ? a.status : 'CREATING' });
      summonedRef.current = [a.id, ...summonedRef.current.filter((x) => x !== a.id)];
      setSummonedIds(summonedRef.current);
      touch(a.id);
      setInfo((p) => ({ ...p, phase: 'online', apiVersion: r.data.apiVersion }));
      return r;
    },
    [noteFailure, upsert, touch],
  );

  const followup = useCallback(
    async (id: string, text: string) => {
      const r = await uplink.followup(id, text);
      if (!r.ok) {
        noteFailure(r);
        return r;
      }
      touch(id);
      const a = agentsRef.current[id];
      if (a) upsert({ ...a, status: 'RUNNING', updatedAt: new Date().toISOString() });
      window.setTimeout(() => void refresh(id), 1200);
      return r;
    },
    [noteFailure, upsert, touch, refresh],
  );

  const stop = useCallback(
    async (id: string) => {
      const r = await uplink.stop(id);
      if (!r.ok) {
        noteFailure(r);
        return r;
      }
      touch(id);
      window.setTimeout(() => void refresh(id), 1200);
      return r;
    },
    [noteFailure, touch, refresh],
  );

  return { info, agents, listedIds, summonedIds, launch, followup, stop, refresh };
}
