/** Deterministic hash + callsign for a real cloud agent id. */
export function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
export const callsignOf = (id: string) => `CLOUD-${hash(id).toString(36).toUpperCase().padStart(4, '0').slice(-4)}`;
