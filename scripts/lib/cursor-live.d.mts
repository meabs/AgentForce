export interface CursorLive {
  id: string;
  name: string;
  title: string;
  state: string;
  url: string;
  updatedAt: string;
  summary: string;
}
export const ROOT: string;
export const PUBLIC_PATH: string;
export const DIST_PATH: string;
export const BRIDGE_PATH: string;
export const DEFAULT_ID: string;
export const DEFAULTS: Readonly<Omit<CursorLive, 'updatedAt'>>;
export function readJson(path: string): any;
export function normalize(input: unknown, prev?: Partial<CursorLive>): CursorLive;
export function sameContent(a: CursorLive | null, b: CursorLive | null): boolean;
export function atomicWrite(path: string, obj: unknown): void;
export function writeLive(obj: CursorLive, opts?: { mirrorDist?: boolean }): void;
