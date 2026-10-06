export type AgentStatus = 'RUNNING' | 'IDLE' | 'BLOCKED';

export interface Agent {
  id: string;
  name: string;
  mission: string;
  status: AgentStatus;
  activity: string;
  progress: number;
  classLabel: string;
  role: string;
  hp: number;
  tokens: number;
  x: number;
  y: number;
  /** Optimistic placeholder while a launch request is in flight */
  pending?: boolean;
  /** Local commander hold (ticker paused) */
  held?: boolean;
  retreated?: boolean;
  /** Set when the unit is driven by a live feed */
  live?: { rawState: string; url: string; updatedAt: string; id: string };
  /** Cursor cloud agent id (bc-…) when this unit is commandable through the LIVE COMMAND UPLINK */
  cloudId?: string;
  /** Latest data from the uplink bridge for real units */
  cloud?: {
    rawStatus: string;
    url: string;
    repo?: string;
    ref?: string;
    branch?: string;
    prUrl?: string;
    summary?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface ActivityEntry {
  id: string;
  timestamp: number;
  agentName: string;
  message: string;
  kind?: 'info' | 'warn' | 'ok';
}

export type TermKind = 'cmd' | 'tool' | 'think' | 'ok' | 'warn' | 'err' | 'out' | 'sys' | 'user' | 'uplink';

export interface TermLine {
  id: string;
  t: number;
  kind: TermKind;
  text: string;
}

/** Local, in-demo command overrides layered on top of ticker / live data. */
export interface AgentOverride {
  held?: boolean;
  retreated?: boolean;
  mission?: string;
  status?: AgentStatus;
  activity?: string;
  progressBoost?: number;
  /** Commander approved a plan: keeps the unit RUNNING after resume */
  approved?: boolean;
}
