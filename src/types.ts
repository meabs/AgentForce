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
  /** Set when the unit is driven by a live feed */
  live?: { rawState: string; url: string; updatedAt: string; id: string };
}

export interface ActivityEntry {
  id: string;
  timestamp: number;
  agentName: string;
  message: string;
  kind?: 'info' | 'warn' | 'ok';
}
