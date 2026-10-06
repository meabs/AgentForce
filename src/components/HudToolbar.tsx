import { toggleAmbient, toggleMuted, useAmbient, useMuted, sfx } from '../lib/sfx';
import { Icon } from './Icon';
import './HudToolbar.css';

interface Props {
  onDemo?: () => void;
  onTerritory?: () => void;
  onWarRoom?: () => void;
  territoryOpen?: boolean;
  warRoomOpen?: boolean;
  demo?: boolean;
  view?: 'map' | 'list';
  onView?: (v: 'map' | 'list') => void;
  onHelp?: () => void;
  /** Render the SOUND / HUM toggles (default true) */
  sound?: boolean;
}

export function HudToolbar({ onDemo, onTerritory, onWarRoom, territoryOpen, warRoomOpen, demo, view, onView, onHelp, sound = true }: Props) {
  const muted = useMuted();
  const ambient = useAmbient();
  return (
    <div className="hud-toolbar" role="toolbar" aria-label="View and sound">
      {onView && (
        <div className="hud-view" role="group" aria-label="Board view">
          {(['map', 'list'] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={`hud-tool hud-tool--view${view === v ? ' is-active' : ''}`}
              aria-pressed={view === v}
              onClick={() => (sfx.tick(), onView(v))}
              title={v === 'map' ? 'Tactical map view (L toggles)' : 'List view: sortable table of every agent (L toggles)'}
            >
              <Icon name={v} className="hud-tool__icon" />
              <span className="hud-tool__label">{v === 'map' ? 'MAP' : 'LIST'}</span>
            </button>
          ))}
        </div>
      )}
      {sound && (
        <>
      <button
        type="button"
        className={`hud-tool${muted ? ' is-off' : ' is-on'}`}
        onClick={toggleMuted}
        title={`${muted ? 'Unmute' : 'Mute'} sound effects and voice lines (M)`}
        aria-label={muted ? 'Sound off, press to unmute' : 'Sound on, press to mute'}
        aria-pressed={!muted}
      >
        <span className="hud-tool__icon" aria-hidden>
          {muted ? '◌' : '◉'}
        </span>
        <span className="hud-tool__label">{muted ? 'SOUND OFF' : 'SOUND ON'}</span>
        <kbd>M</kbd>
      </button>
      <button
        type="button"
        className={`hud-tool${ambient && !muted ? ' is-on' : ' is-off'}`}
        onClick={toggleAmbient}
        title={`${ambient ? 'Stop' : 'Play'} the low bridge hum ambience (B)${muted ? '. Sound is muted' : ''}`}
        aria-label="Bridge hum ambience"
        aria-pressed={ambient}
      >
        <span className="hud-tool__icon" aria-hidden>
          {ambient ? '≋' : '∼'}
        </span>
        <span className="hud-tool__label">{ambient ? 'HUM ON' : 'HUM OFF'}</span>
        <kbd>B</kbd>
      </button>
        </>
      )}
      {onTerritory && (
        <button type="button" className={`hud-tool${territoryOpen ? ' is-active' : ''}`} onClick={() => (sfx.tick(), onTerritory())} title="Territory map: fog of war (T)" aria-label="Territory map (T)" aria-pressed={territoryOpen}>
          <span className="hud-tool__icon" aria-hidden>
            ▦
          </span>
          <span className="hud-tool__label">TERRITORY</span>
          <kbd>T</kbd>
        </button>
      )}
      {onWarRoom && (
        <button type="button" className={`hud-tool${warRoomOpen ? ' is-active' : ''}`} onClick={() => (sfx.tick(), onWarRoom())} title="War Room: operations timeline (W)" aria-label="War room timeline (W)" aria-pressed={warRoomOpen}>
          <span className="hud-tool__icon" aria-hidden>
            ☰
          </span>
          <span className="hud-tool__label">WAR ROOM</span>
          <kbd>W</kbd>
        </button>
      )}
      {onDemo && (
        <button type="button" className={`hud-tool hud-tool--demo${demo ? ' is-active' : ''}`} onClick={onDemo} title={demo ? 'Exit the mission replay' : 'Play the 60 second mission replay (no API key needed)'} aria-label={demo ? 'Exit demo replay' : 'Play demo replay'}>
          <span className="hud-tool__icon" aria-hidden>
            {demo ? '■' : '▶'}
          </span>
          <span className="hud-tool__label">{demo ? 'EXIT DEMO' : 'DEMO'}</span>
        </button>
      )}
      {onHelp && (
        <button type="button" className="hud-tool hud-tool--help" onClick={onHelp} title="Keyboard shortcuts and glossary (?)" aria-label="Help: shortcuts and glossary">
          <Icon name="help" className="hud-tool__icon" />
          <span className="hud-tool__label">HELP</span>
          <kbd>?</kbd>
        </button>
      )}
    </div>
  );
}
