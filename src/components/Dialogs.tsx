import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DEFAULT_REF, DEFAULT_REPO } from '../lib/uplink';
import type { UplinkInfo } from '../hooks/useCloudAgents';
import './Dialogs.css';

function UplinkLine({ info }: { info: UplinkInfo }) {
  const tone = info.phase === 'online' ? 'on' : info.phase === 'checking' ? 'wait' : 'off';
  const text =
    info.phase === 'online'
      ? `UPLINK ONLINE · CURSOR API ${info.apiVersion ?? ''}`.trim()
      : info.phase === 'checking'
        ? 'UPLINK HANDSHAKE…'
        : info.phase === 'offline'
          ? 'UPLINK OFFLINE · set CURSOR_API_KEY (see README: LIVE COMMAND UPLINK)'
          : `UPLINK ERROR · ${info.reason ?? 'bridge unreachable'}`;
  return (
    <div className={`dlg__uplink dlg__uplink--${tone}`}>
      <span className="dlg__dot" />
      {text}
    </div>
  );
}

function Modal({ children, onClose, tone, label }: { children: ReactNode; onClose: () => void; tone: 'cyan' | 'amber' | 'red'; label: string }) {
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

interface SummonDialogProps {
  uplink: UplinkInfo;
  busy: boolean;
  error: string | null;
  onLaunch: (prompt: string, repo: string, ref: string) => void;
  onDrill: () => void;
  onClose: () => void;
  /** Restores the last attempt after a failed launch */
  initial?: { prompt: string; repo: string; ref: string };
}

export function SummonDialog({ uplink, busy, error, onLaunch, onDrill, onClose, initial }: SummonDialogProps) {
  const [prompt, setPrompt] = useState(initial?.prompt ?? '');
  const [repo, setRepo] = useState(initial?.repo ?? DEFAULT_REPO);
  const [ref, setRef] = useState(initial?.ref ?? DEFAULT_REF);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    window.setTimeout(() => promptRef.current?.focus(), 30);
  }, []);
  const canLaunch = !busy && prompt.trim().length > 0 && repo.trim().length > 0;
  const launch = () => canLaunch && onLaunch(prompt.trim(), repo.trim(), ref.trim() || DEFAULT_REF);

  return (
    <Modal onClose={onClose} tone="cyan" label="Summon agent">
      <header className="dlg__head">
        <span className="dlg__tag">＋ SUMMON AGENT</span>
        <button type="button" className="dlg__x" onClick={onClose} aria-label="Cancel (Esc)">
          ✕
        </button>
      </header>
      <UplinkLine info={uplink} />
      <label className="dlg__field">
        <span>MISSION PROMPT</span>
        <textarea
          ref={promptRef}
          rows={4}
          value={prompt}
          placeholder="e.g. Add a /health endpoint with a unit test and open a PR"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) launch();
          }}
        />
      </label>
      <div className="dlg__row">
        <label className="dlg__field dlg__field--grow">
          <span>REPOSITORY</span>
          <input value={repo} onChange={(e) => setRepo(e.target.value)} onKeyDown={(e) => e.stopPropagation()} spellCheck={false} />
        </label>
        <label className="dlg__field dlg__field--ref">
          <span>REF</span>
          <input value={ref} onChange={(e) => setRef(e.target.value)} onKeyDown={(e) => e.stopPropagation()} spellCheck={false} />
        </label>
      </div>
      {error && <div className="dlg__error">✗ {error}</div>}
      <p className="dlg__note">
        LAUNCH starts a <b>real Cursor cloud agent</b> on that repo via the local uplink (uses your Cursor usage). DRILL UNIT
        warps in a simulated wingmate instead.
      </p>
      <footer className="dlg__actions">
        <button type="button" className="dlg-btn" onClick={onDrill} disabled={busy}>
          DRILL UNIT (SIMULATED)
        </button>
        <button type="button" className="dlg-btn dlg-btn--ghost" onClick={onClose} disabled={busy}>
          CANCEL
        </button>
        <button type="button" className="dlg-btn dlg-btn--go" onClick={launch} disabled={!canLaunch}>
          {busy ? 'LAUNCHING…' : '▲ LAUNCH CLOUD AGENT'}
          <kbd>CTRL+ENTER</kbd>
        </button>
      </footer>
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
