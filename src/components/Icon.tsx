import './Icon.css';

/** game-icons.net glyphs (CC BY 3.0, see public/art/CREDITS.md), tinted with currentColor via CSS masks. */
export type IconName =
  | 'launch'
  | 'stop'
  | 'followup'
  | 'pr'
  | 'branch'
  | 'repo'
  | 'archive'
  | 'alert'
  | 'success'
  | 'running'
  | 'search'
  | 'help'
  | 'pause'
  | 'approve'
  | 'list'
  | 'map'
  | 'recall'
  | 'refresh'
  | 'pending';

export function Icon({ name, size, className = '', label }: { name: IconName; size?: number; className?: string; label?: string }) {
  return (
    <span
      className={`gi gi--${name} ${className}`}
      style={size ? { width: size, height: size } : undefined}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}
