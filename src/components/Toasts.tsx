import { Icon, type IconName } from './Icon';

export type ToastTone = 'amber' | 'green' | 'red';
export interface ToastItem {
  id: number;
  text: string;
  tone: ToastTone;
  action?: { label: string; run: () => void };
}

const TONE_ICON: Record<ToastTone, IconName> = { amber: 'running', green: 'success', red: 'alert' };

/** Action confirmations. Polite live region so screen readers hear them; each one can be dismissed. */
export function Toasts({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`cmd-toast cmd-toast--${t.tone}`}>
          <Icon name={TONE_ICON[t.tone]} className="cmd-toast__icon" />
          <span className="cmd-toast__text">{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="cmd-toast__action"
              onClick={() => {
                t.action!.run();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" className="cmd-toast__x" aria-label="Dismiss notification" onClick={() => onDismiss(t.id)}>
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
