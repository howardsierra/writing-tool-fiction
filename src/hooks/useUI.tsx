import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

type ToastKind = 'success' | 'error' | 'info';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface UIContextType {
  toast: (message: string, kind?: ToastKind, action?: ToastAction) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const UIContext = createContext<UIContextType | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(t => t.filter(x => x.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'info', action?: ToastAction) => {
    const id = ++idRef.current;
    setToasts(t => [...t.slice(-3), { id, kind, message, action }]);
    setTimeout(() => dismiss(id), action ? 7000 : kind === 'error' ? 6000 : 3500);
  }, [dismiss]);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>(resolve => setConfirmState({ ...options, resolve }));
  }, []);

  const closeConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  useEffect(() => {
    if (!confirmState) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirm(false);
      if (e.key === 'Enter') closeConfirm(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}

      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-[100] flex flex-col items-end gap-2 pointer-events-none">
        {toasts.map(t => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertTriangle : Info;
          return (
            <div
              key={t.id}
              role="status"
              className="pointer-events-auto animate-slide-up flex items-start gap-3 w-full sm:w-auto sm:max-w-sm rounded-xl border border-line bg-elevated/95 backdrop-blur px-4 py-3 shadow-float"
            >
              <Icon className={twMerge('w-4 h-4 mt-0.5 flex-shrink-0',
                t.kind === 'success' && 'text-success',
                t.kind === 'error' && 'text-danger',
                t.kind === 'info' && 'text-accent')} />
              <p className="text-sm text-fg flex-1 leading-snug">{t.message}</p>
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className="text-xs font-semibold text-accent hover:text-accent-strong whitespace-nowrap"
                >
                  {t.action.label}
                </button>
              )}
              <button onClick={() => dismiss(t.id)} className="text-fg-subtle hover:text-fg" aria-label="Dismiss">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>

      {confirmState && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => closeConfirm(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={e => e.stopPropagation()}
            className="animate-pop-in w-full max-w-sm rounded-2xl border border-line bg-elevated shadow-float p-6"
          >
            <h2 className="font-serif text-xl text-fg">{confirmState.title}</h2>
            {confirmState.message && <p className="mt-2 text-sm text-fg-muted leading-relaxed">{confirmState.message}</p>}
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => closeConfirm(false)} className="px-4 py-2 rounded-lg text-sm text-fg-muted hover:text-fg hover:bg-hover transition-colors">
                Cancel
              </button>
              <button
                autoFocus
                onClick={() => closeConfirm(true)}
                className={twMerge(
                  'px-4 py-2 rounded-lg text-sm font-semibold transition-colors',
                  confirmState.danger ? 'bg-danger text-white hover:opacity-90' : 'bg-accent text-on-accent hover:bg-accent-strong'
                )}
              >
                {confirmState.confirmLabel || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  );
}

export function useUI() {
  const ctx = useContext(UIContext);
  if (!ctx) throw new Error('useUI must be used within UIProvider');
  return ctx;
}
