import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { AgentStatus, TermLine } from '../types';
import './Terminal.css';

interface TerminalProps {
  agentName: string;
  status: AgentStatus;
  held: boolean;
  lines: TermLine[];
  onSubmit: (input: string) => void;
  /** Real units: live stream link state (LIVE pulse / POLLING fallback) */
  link?: { state: 'connecting' | 'live' | 'polling' | 'ended' | 'error'; reason?: string } | null;
}

const LINK_LABEL = { connecting: 'LINKING…', live: 'LIVE', polling: 'POLLING', ended: 'STANDBY', error: 'RELINK…' } as const;

const FRESH_MS = 2500;
const GLYPH: Record<TermLine['kind'], string> = {
  cmd: '$',
  tool: '→',
  think: '●',
  ok: '✓',
  warn: '⚠',
  err: '✗',
  out: ' ',
  sys: '·',
  user: '❯',
  uplink: '◉',
  say: '›',
  call: '>',
};

/** Types the line out character by character once, if it's fresh. */
function TypedText({ text, fresh, onProgress }: { text: string; fresh: boolean; onProgress: () => void }) {
  const [n, setN] = useState(fresh ? 0 : text.length);
  useEffect(() => {
    if (n >= text.length) return;
    const step = Math.max(1, Math.ceil(text.length / 40));
    const id = window.setTimeout(() => setN((v) => Math.min(text.length, v + step)), 14);
    return () => window.clearTimeout(id);
  }, [n, text.length]);
  useEffect(onProgress, [n, onProgress]);
  const done = n >= text.length;
  return (
    <>
      {text.slice(0, n)}
      {!done && <span className="term__caret term__caret--inline" />}
    </>
  );
}

export function Terminal({ agentName, status, held, lines, onSubmit, link }: TerminalProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickRef = useRef(true);
  const [stuck, setStuck] = useState(true);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [hIdx, setHIdx] = useState(-1);
  const mountedAt = useRef(Date.now());

  const scrollToEnd = useRef(() => {
    const el = bodyRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }).current;

  useLayoutEffect(scrollToEnd, [lines, scrollToEnd]);

  const onScroll = () => {
    const el = bodyRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    stickRef.current = near;
    setStuck(near);
  };

  const jump = () => {
    stickRef.current = true;
    setStuck(true);
    scrollToEnd();
  };

  const prompt = `${agentName.toLowerCase()}@fleet:~${held ? ' [HOLD]' : ''}$`;
  const now = Date.now();

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const v = input.trim();
      if (!v) return;
      onSubmit(v);
      setHistory((h) => [v, ...h].slice(0, 30));
      setHIdx(-1);
      setInput('');
      jump();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = Math.min(history.length - 1, hIdx + 1);
      if (i >= 0) (setHIdx(i), setInput(history[i]));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const i = hIdx - 1;
      setHIdx(Math.max(-1, i));
      setInput(i >= 0 ? history[i] : '');
    } else if (e.key === 'Escape') {
      inputRef.current?.blur();
    }
  };

  return (
    <div className={`term term--${status.toLowerCase()}${held ? ' term--held' : ''}`}>
      <div className="term__bar">
        <span className="term__dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="term__title">TTY · {agentName} · TOOL-CALL LOG</span>
        {link && !held ? (
          <span
            className={`term__link term__link--${link.state}`}
            title={link.state === 'polling' ? `Fallback: transcript polling (${link.reason ?? 'stream unavailable'})` : link.state === 'live' ? 'Live run stream (SSE)' : link.reason}
            data-testid="term-link"
          >
            <i aria-hidden />
            {LINK_LABEL[link.state]}
          </span>
        ) : (
          <span className="term__state">{held ? 'PAUSED' : 'STREAMING'}</span>
        )}
      </div>
      <div className="term__body" ref={bodyRef} onScroll={onScroll} onClick={() => inputRef.current?.focus()}>
        {lines.map((l, i) => {
          const fresh = i === lines.length - 1 && l.t > mountedAt.current - 1 && now - l.t < FRESH_MS;
          return (
            <div key={l.id} className={`term__line term__line--${l.kind}${l.live ? ' term__line--live' : ''}`}>
              <span className="term__time">{new Date(l.t).toLocaleTimeString('en-GB', { hour12: false })}</span>
              {l.kind === 'cmd' || l.kind === 'user' ? (
                <span className="term__prompt">{l.kind === 'user' ? 'cmdr@bridge:~$' : prompt}</span>
              ) : (
                <span className="term__glyph">{GLYPH[l.kind]}</span>
              )}
              <span className="term__text">
                {l.skey ? (
                  <>
                    {l.text}
                    {l.live && <span className="term__caret term__caret--stream" />}
                  </>
                ) : (
                  <TypedText text={l.text} fresh={fresh} onProgress={scrollToEnd} />
                )}
              </span>
            </div>
          );
        })}
        <div className="term__line term__line--idle">
          <span className="term__time" />
          <span className="term__prompt">{prompt}</span>
          <span className="term__caret" />
        </div>
      </div>
      {!stuck && (
        <button type="button" className="term__jump" onClick={jump}>
          ▼ LIVE
        </button>
      )}
      <label className="term__input">
        <span className="term__input-prompt">cmdr@bridge:~$</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="help · status · hold · resume · approve · retreat · assign <mission> · clear"
          spellCheck={false}
          autoComplete="off"
          aria-label={`Command input for ${agentName}`}
        />
      </label>
    </div>
  );
}
