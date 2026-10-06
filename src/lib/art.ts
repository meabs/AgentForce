/**
 * Free art shipped in public/art (credits in public/art/CREDITS.md).
 * URLs go through BASE_URL so the GitHub Pages demo (/AgentForce/) resolves them too.
 */
import { hash } from './callsign';

const BASE = import.meta.env.BASE_URL;
export const artUrl = (path: string) => `${BASE}art/${path}`;

/** Kenney Space Kit (CC0) isometric craft, one per unit (stable by id). */
const SHIPS = ['speedera', 'speederb', 'speederd', 'racer', 'miner', 'cargoa'] as const;
export const shipFor = (id: string) => artUrl(`kenney/ship-${SHIPS[hash(id) % SHIPS.length]}.png`);

/** Kenney Space Kit (CC0) stations used as repo markers on the map. */
export const STATIONS = ['kenney/station-hangar.png', 'kenney/station-dome.png', 'kenney/station-dish.png'].map(artUrl);
