import { memo, useMemo } from 'react';
import { heat, MAP_MAX, MAP_MIN, type Territory, type Tile, type Touch } from '../lib/territory';
import './Territory.css';

interface Props {
  territory: Territory;
  touches: Record<string, Touch> | undefined;
  now: number;
  labels?: boolean;
  /** Unit dots in map space (0-100) */
  units?: Array<{ id: string; x: number; y: number; color: string; name?: string }>;
  onHover?: (tile: Tile | null) => void;
  hovered?: string | null;
  className?: string;
}

/** Top-down fog-of-war grid. Map space 18..82 is stretched onto the SVG's 0..100 viewBox. */
export const TerritoryGrid = memo(function TerritoryGrid({ territory, touches, now, labels, units, onHover, hovered, className }: Props) {
  const n = territory.size;
  const cell = 100 / n;
  const borders = useMemo(() => {
    const at = new Map<string, Tile>();
    for (const t of territory.tiles) at.set(`${t.gx},${t.gy}`, t);
    const segs: string[] = [];
    for (const t of territory.tiles) {
      const r = at.get(`${t.gx + 1},${t.gy}`);
      const b = at.get(`${t.gx},${t.gy + 1}`);
      if (r && r.dir !== t.dir) segs.push(`M${(t.gx + 1) * cell} ${t.gy * cell}v${cell}`);
      if (b && b.dir !== t.dir) segs.push(`M${t.gx * cell} ${(t.gy + 1) * cell}h${cell}`);
    }
    return segs.join('');
  }, [territory, cell]);
  const toPct = (v: number) => ((v - MAP_MIN) / (MAP_MAX - MAP_MIN)) * 100;

  return (
    <svg className={`terr-grid ${className ?? ''}`} viewBox="0 0 100 100" preserveAspectRatio="none" onMouseLeave={() => onHover?.(null)}>
      <defs>
        <pattern id="terr-fog" width="2" height="2" patternUnits="userSpaceOnUse">
          <rect width="2" height="2" fill="#030a12" />
          <circle cx="0.5" cy="0.5" r="0.18" fill="rgba(0,229,255,0.12)" />
        </pattern>
        <filter id="terr-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {territory.tiles.map((t) => {
        const touch = t.path ? touches?.[t.path] : undefined;
        const x = t.gx * cell;
        const y = t.gy * cell;
        if (!t.path) return <rect key={t.i} x={x} y={y} width={cell} height={cell} className="terr-tile terr-tile--void" />;
        if (!touch)
          return (
            <rect
              key={t.i}
              x={x + 0.08}
              y={y + 0.08}
              width={cell - 0.16}
              height={cell - 0.16}
              className={`terr-tile terr-tile--fog${hovered === t.path ? ' is-hover' : ''}`}
              onMouseEnter={() => onHover?.(t)}
            />
          );
        const h = heat(touch.at, now);
        const hot = now - touch.at < 6000;
        return (
          <g key={t.i} onMouseEnter={() => onHover?.(t)} className={`terr-lit${hot ? ' is-hot' : ''}${hovered === t.path ? ' is-hover' : ''}`}>
            <rect
              x={x + 0.08}
              y={y + 0.08}
              width={cell - 0.16}
              height={cell - 0.16}
              fill={touch.color}
              fillOpacity={0.18 + 0.55 * h}
              stroke={touch.color}
              strokeOpacity={0.4 + 0.6 * h}
              strokeWidth={0.18}
              filter={hot ? 'url(#terr-glow)' : undefined}
            />
            {touch.kind === 'edit' && (
              <rect x={x + cell * 0.36} y={y + cell * 0.36} width={cell * 0.28} height={cell * 0.28} fill="#fff" fillOpacity={0.35 + 0.5 * h} />
            )}
          </g>
        );
      })}
      <path d={borders} className="terr-borders" />
      {units?.map((u) => (
        <g key={u.id} className="terr-unit" transform={`translate(${toPct(u.x)} ${toPct(u.y)})`}>
          <circle r={1.8} fill="none" stroke={u.color} strokeWidth={0.35} />
          <circle r={0.8} fill={u.color} />
        </g>
      ))}
      {labels &&
        territory.districts
          .filter((d) => d.count >= 3)
          .map((d) => (
            <text key={d.dir} x={Math.max(11, Math.min(89, (d.gx + 0.5) * cell))} y={Math.max(4, Math.min(96, (d.gy + 0.5) * cell))} className="terr-label">
              {d.label}
            </text>
          ))}
    </svg>
  );
});
