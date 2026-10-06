import { useEffect, useRef, useState, type ReactNode } from 'react';
import type React from 'react';
import { DEFAULT_REF, DEFAULT_REPO, normaliseRepo } from '../lib/uplink';
import { Icon } from './Icon';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import './Dialogs.css';

function UplinkLine({ info }: { info: UplinkInfo }) {
  const tone = info.phase === 'online' ? 'on' : info.phase === 'checking' ? 'wait' : 'off';
  const text =
    info.phase === 'online'
      ? `Connected to Cursor API ${info.apiVersion ?? ''}`.trim()
      : info.phase === 'checking'
        ? 'Connecting to Cursor…'
        : info.phase === 'offline'
          ? 'Not connected: set CURSOR_API_KEY in .env.local (README: Arm the uplink)'
          : `Connection error: ${info.reason ?? 'bridge unreachable'}`;
  return (
    <div className={`dlg__uplink dlg__uplink--${tone}`}>
      <span className="dlg__dot" />
      {text}
    </div>
  );
}

function Modal({ children, onClose, tone, label }: { children: ReactNode; onClose: () => void; tone: 'cyan' | 'amber' | 'red'; label: string }) {
  useEffect(() => {
    // Give focus back to whatever opened the dialog when it closes.
    const opener = document.activeElement as HTMLElement | null;
    return () => {
      if (opener && document.contains(opener)) window.setTimeout(() => opener.focus(), 0);
    };
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="dlg-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dlg dlg--${tone} hud-panel`} role="dialog" aria-modal="true" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Summon

export interface LaunchSpec {
  prompt: string;
  repo: string;
  ref: string;
  model?: string;
}

interface SummonDialogProps {
  uplink: UplinkInfo;
  busy: boolean;
  error: string | null;
  onLaunch: (spec: LaunchSpec) => void;
  onDrill: () => void;
  onClose: () => void;
  /** Restores the last attempt after a failed launch */
  initial?: LaunchSpec;
  /** Launchable model ids from the API; null while loading, [] if unavailable */
  models?: string[] | null;
  modelsError?: string | null;
  /** Repositories to suggest (recently used + seen on agents) */
  repoOptions?: string[];
}

const MAX_PROMPT = 20_000;

export function SummonDialog({ uplink, busy, error, onLaunch, onDrill, onClose, initial, models = [], modelsError, repoOptions = [] }: SummonDialogProps) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [repo, setRepo] = useState(initial?.repo ?? repoOptions[0] ?? DEFAULT_REPO);
  const [ref, setRef] = useState(initial?.ref ?? DEFAULT_REF);
  const [model, setModel] = useState(initial?.model ?? '');
  const [touched, setTouched] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const repoRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    window.setTimeout(() => promptRef.current?.focus(), 30);
  }, []);
  const online = uplink.phase === 'online';
  const repoCheck = normaliseRepo(repo);
  const errors = {
    prompt: !prompt.trim() ? 'Describe the task for the agent.' : prompt.length > MAX_PROMPT ? `Keep it under ${MAX_PROMPT.toLocaleString()} characters.` : '',
    repo: repoCheck.error ?? '',
    ref: /\s/.test(ref.trim()) ? 'Branch or ref cannot contain spaces.' : ref.length > 200 ? 'Too long.' : '',
  };
  const invalid = !!(errors.prompt || errors.repo || errors.ref);
  const show = (k: keyof typeof errors) => (touched ? errors[k] : '');
  const launch = () => {
    setTouched(true);
    if (busy) return;
    if (invalid) {
      (errors.prompt ? promptRef : errors.repo ? repoRef : refRef).current?.focus();
      return;
    }
    if (!online) return;
    onLaunch({ prompt: prompt.trim(), repo: repoCheck.url!, ref: ref.trim() || DEFAULT_REF, model: model || undefined });
  };
  const stop = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) launch();
  };

  return (
    <Modal onClose={onClose} tone="cyan" label="Launch a new agent">
      <header className="dlg__head">
        <span className="dlg__tag">
          <Icon name="launch" /> LAUNCH A NEW AGENT <em className="dlg__rts">SUMMON</em>
        </span>
        <button type="button" className="dlg__x" onClick={onClose} aria-label="Cancel (Esc)">
          ✕
        </button>
      </header>
      <UplinkLine info={uplink} />
      {error && (
        <div className="dlg__error" role="alert">
          <Icon name="alert" /> Last launch failed: {error}
        </div>
      )}
      <form
        className="dlg__form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          launch();
        }}
      >
        <label className="dlg__field" htmlFor="launch-prompt">
          <span>
            Task prompt <i aria-hidden>*</i>
          </span>
          <textarea
            id="launch-prompt"
            ref={promptRef}
            rows={5}
            value={prompt}
            placeholder="e.g. Add a /health endpoint with a unit test"
            aria-invalid={!!show('prompt')}
            aria-describedby="launch-prompt-msg"
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={stop}
          />
          <small id="launch-prompt-msg" className={show('prompt') ? 'dlg__msg dlg__msg--err' : 'dlg__msg'}>
            {show('prompt') || `What should the agent do? ${prompt.length ? `${prompt.length.toLocaleString()} chars` : ''}`}
          </small>
        </label>
        <div className="dlg__row">
          <label className="dlg__field dlg__field--grow" htmlFor="launch-repo">
            <span>
              Repository <i aria-hidden>*</i>
            </span>
            <input
              id="launch-repo"
              ref={repoRef}
              value={repo}
              list="launch-repo-list"
              aria-invalid={!!show('repo')}
              aria-describedby="launch-repo-msg"
              onChange={(e) => setRepo(e.target.value)}
              onKeyDown={stop}
              spellCheck={false}
              autoComplete="off"
            />
            <datalist id="launch-repo-list">
              {repoOptions.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
            <small id="launch-repo-msg" className={show('repo') ? 'dlg__msg dlg__msg--err' : 'dlg__msg'}>
              {show('repo') || 'owner/repo or a full https URL'}
            </small>
          </label>
          <label className="dlg__field dlg__field--ref" htmlFor="launch-ref">
            <span>Base branch / ref</span>
            <input
              id="launch-ref"
              ref={refRef}
              value={ref}
              aria-invalid={!!show('ref')}
              aria-describedby="launch-ref-msg"
              onChange={(e) => setRef(e.target.value)}
              onKeyDown={stop}
              spellCheck={false}
            />
            <small id="launch-ref-msg" className={show('ref') ? 'dlg__msg dlg__msg--err' : 'dlg__msg'}>
              {show('ref') || 'Defaults to main'}
            </small>
          </label>
        </div>
        <label className="dlg__field" htmlFor="launch-model">
          <span>Model</span>
          <select id="launch-model" value={model} onChange={(e) => setModel(e.target.value)} onKeyDown={stop} disabled={!online}>
            <option value="">Default (your Cursor setting)</option>
            {(models ?? []).map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <small className="dlg__msg">
            {!online
              ? 'Connect to Cursor to choose a model.'
              : models === null
                ? 'Loading the model list…'
                : modelsError
                  ? `Could not load models (${modelsError}); the default will be used.`
                  : `${models.length} recommended models from GET /v0/models.`}
          </small>
        </label>
        <p className="dlg__note">
          Starts a <b>real Cursor cloud agent</b> with access to that repository and spends your Cursor usage. It works on its own branch and does{' '}
          <b>not</b> open a pull request automatically. Want to try the board without that? Use <b>Add simulated unit</b>.
        </p>
        <footer className="dlg__actions">
          <button type="button" className="dlg-btn" onClick={onDrill} disabled={busy}>
            Add simulated unit
          </button>
          <button type="button" className="dlg-btn dlg-btn--ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            type="submit"
            className="dlg-btn dlg-btn--go"
            disabled={busy || !online || (touched && invalid)}
            title={!online ? 'Not connected to Cursor: set CURSOR_API_KEY' : 'Launch (Ctrl+Enter)'}
          >
            <Icon name="launch" /> {busy ? 'Launching…' : 'Launch agent'}
            <kbd>CTRL+ENTER</kbd>
          </button>
        </footer>
        {!online && (
          <p className="dlg__msg dlg__msg--warn" role="note">
            {uplink.phase === 'checking' ? 'Connecting to Cursor…' : 'Launch is disabled until the board is connected to Cursor (CURSOR_API_KEY).'}
          </p>
        )}
      </form>
    </Modal>
  );
}

// ---------------------------------------------------------------- Confirm

export interface ConfirmSpec {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone: 'amber' | 'red';
  onConfirm: () => void;
}

export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    window.setTimeout(() => okRef.current?.focus(), 30);
  }, []);
  return (
    <Modal onClose={onClose} tone={spec.tone} label={spec.title}>
      <header className="dlg__head">
        <span className="dlg__tag">{spec.title}</span>
        <button type="button" className="dlg__x" onClick={onClose} aria-label="Cancel (Esc)">
          ✕
        </button>
      </header>
      <div className="dlg__body">{spec.body}</div>
      <footer className="dlg__actions">
        <button type="button" className="dlg-btn dlg-btn--ghost" onClick={onClose}>
          CANCEL
        </button>
        <button
          ref={okRef}
          type="button"
          className={`dlg-btn dlg-btn--${spec.tone}`}
          onClick={() => {
            onClose();
            spec.onConfirm();
          }}
        >
          {spec.confirmLabel}
        </button>
      </footer>
    </Modal>
  );
}
