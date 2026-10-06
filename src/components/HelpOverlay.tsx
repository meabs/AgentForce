import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

const KEYS: Array<[string, string]> = [
  ['S', 'Launch a new agent (Summon)'],
  ['/', 'Search agents'],
  ['L', 'Switch between map and list view'],
  ['1 – 9', 'Select an agent in the roster'],
  ['Enter', 'Open the selected agent’s details'],
  ['A', 'Write a follow-up (Assign mission)'],
  ['R', 'Stop the agent (Retreat), asks first'],
  ['P', 'Approve plan (real agents ask first)'],
  ['H / Space', 'Pause or resume board updates (Hold)'],
  ['T / W', 'Territory map / War Room timeline'],
  ['M / B', 'Sound on/off · bridge hum on/off'],
  ['?', 'This help'],
  ['Esc', 'Close the open panel or dialog'],
];

const GLOSSARY: Array<[string, string]> = [
  ['Unit', 'An agent. CLOUD-xxxx units are real Cursor cloud agents; the others are simulated.'],
  ['Summon / Deploy', 'Launch a new cloud agent on a repository.'],
  ['Assign mission', 'Send a follow-up message to the agent.'],
  ['Approve plan', 'Send the follow-up “Approved, proceed.”'],
  ['Retreat', 'Stop the agent’s current run (it is not deleted).'],
  ['Hold board', 'Pause updates for that agent on this board only. The cloud agent keeps running.'],
  ['Archive tray', 'Hidden, finished agents. Board only: nothing is sent to Cursor.'],
  ['Cockpit', 'The detail panel: status, links, conversation, follow-up and stop.'],
  ['Uplink', 'The local bridge to the Cursor API. Online = your API key works.'],
];

const STATUSES: Array<[string, string, string]> = [
  ['run', 'Running / Starting', 'The agent is working.'],
  ['alert', 'Failed / Needs input', 'Something needs you. Open it to read why.'],
  ['done', 'Finished / Expired / Stopped', 'The run is over. Follow up to give it more work.'],
  ['hold', 'Paused (board)', 'You paused updates locally.'],
];

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === '?') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="dlg-backdrop help-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="help kenney-frame" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <header className="help__head">
          <h2 id="help-title">
            <Icon name="help" /> How to use Fleet Command
          </h2>
          <button ref={closeRef} type="button" className="dlg__x" onClick={onClose} aria-label="Close help (Esc)">
            ✕
          </button>
        </header>
        <div className="help__grid">
          <section>
            <h3>Keyboard shortcuts</h3>
            <p className="help__note">Shortcuts never fire while you are typing in a box.</p>
            <dl className="help__keys">
              {KEYS.map(([k, v]) => (
                <div key={k}>
                  <dt>
                    <kbd>{k}</kbd>
                  </dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
          <section>
            <h3>What the words mean</h3>
            <dl className="help__gloss">
              {GLOSSARY.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            <h3>Status colours</h3>
            <ul className="help__status">
              {STATUSES.map(([tone, k, v]) => (
                <li key={k}>
                  <span className={`status-chip status-chip--${tone}`}>{k}</span> {v}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
