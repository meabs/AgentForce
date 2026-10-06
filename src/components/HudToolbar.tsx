import { toggleAmbient, toggleMuted, useAmbient, useMuted, sfx } from '../lib/sfx';
import './HudToolbar.css';

interface Props {
  onDemo?: () => void;
  onTerritory?: () => void;
  onWarRoom?: () => void;
  territoryOpen?: boolean;
  warRoomOpen?: boolean;
  demo?: boolean;
}

export function HudToolbar({ onDemo, onTerritory, onWarRoom, territoryOpen, warRoomOpen, demo }: Props) {
  const muted = useMuted();
  const ambient = useAmbient();
  return (
    <div className="hud-toolbar">
      <button
        type="button"
        className={`hud-tool${muted ? ' is-off' : ' is-on'}`}
        onClick={toggleMuted}
        title={`${muted ? 'Unmute' : 'Mute'} sound effects and voice lines (M)`}
        aria-pressed={!muted}
      >
        <span className="hud-tool__icon" aria-hidden>
          {muted ? '◌' : '◉'}
        </span>
        {muted ? 'SOUND OFF' : 'SOUND ON'}
        <kbd>M</kbd>
      </button>
      <button
        type="button"
        className={`hud-tool${ambient && !muted ? ' is-on' : ' is-off'}`}
        onClick={toggleAmbient}
        title={`${ambient ? 'Stop' : 'Play'} the low bridge hum ambience (B)${muted ? '. Sound is muted' : ''}`}
        aria-pressed={ambient}
      >
        <span className="hud-tool__icon" aria-hidden>
          {ambient ? '≋' : '∼'}
        </span>
        {ambient ? 'HUM ON' : 'HUM OFF'}
        <kbd>B</kbd>
      </button>
      {onTerritory && (
        <button type="button" className={`hud-tool${territoryOpen ? ' is-active' : ''}`} onClick={() => (sfx.tick(), onTerritory())} title="Territory map: fog of war (T)">
          <span className="hud-tool__icon" aria-hidden>
            ▦
          </span>
          TERRITORY<kbd>T</kbd>
        </button>
      )}
      {onWarRoom && (
        <button type="button" className={`hud-tool${warRoomOpen ? ' is-active' : ''}`} onClick={() => (sfx.tick(), onWarRoom())} title="War Room: operations timeline (W)">
          <span className="hud-tool__icon" aria-hidden>
            ☰
          </span>
          WAR ROOM<kbd>W</kbd>
        </button>
      )}
      {onDemo && (
        <button type="button" className={`hud-tool hud-tool--demo${demo ? ' is-active' : ''}`} onClick={onDemo} title={demo ? 'Exit the mission replay' : 'Play the 60 second mission replay (no API key needed)'}>
          <span className="hud-tool__icon" aria-hidden>
            {demo ? '■' : '▶'}
          </span>
          {demo ? 'EXIT DEMO' : 'DEMO'}
        </button>
      )}
    </div>
  );
}
