import { useEffect, useRef, useState, forwardRef } from 'react';
import { X } from 'lucide-react';
import { twMerge } from 'tailwind-merge';

/* ---------- Modal ---------- */

export function Modal({
  title,
  icon,
  onClose,
  children,
  footer,
  size = 'md',
  bodyClassName,
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  bodyClassName?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const width = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-5xl' }[size];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/55 backdrop-blur-sm animate-fade-in"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={e => e.stopPropagation()}
        className={twMerge(
          'animate-pop-in w-full bg-elevated border border-line shadow-float flex flex-col overflow-hidden',
          'rounded-t-2xl sm:rounded-2xl max-h-[92dvh] sm:max-h-[86vh]',
          width
        )}
      >
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-line">
          <h2 className="flex items-center gap-2.5 font-serif text-lg text-fg min-w-0">
            {icon && <span className="text-accent flex-shrink-0">{icon}</span>}
            <span className="truncate">{title}</span>
          </h2>
          <button onClick={onClose} className="p-1.5 -mr-1.5 rounded-lg text-fg-subtle hover:text-fg hover:bg-hover transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className={twMerge('flex-1 overflow-y-auto p-6', bodyClassName)}>{children}</div>
        {footer && <div className="px-6 py-4 border-t border-line bg-surface/60 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Buttons ---------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export const Button = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' }>(
  function Button({ variant = 'secondary', size = 'md', className, ...props }, ref) {
    return (
      <button
        ref={ref}
        {...props}
        className={twMerge(
          'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
          size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm',
          variant === 'primary' && 'bg-accent text-on-accent hover:bg-accent-strong shadow-soft font-semibold',
          variant === 'secondary' && 'bg-surface border border-line text-fg hover:border-line-strong hover:bg-hover',
          variant === 'ghost' && 'text-fg-muted hover:text-fg hover:bg-hover',
          variant === 'danger' && 'bg-danger-soft text-danger hover:bg-danger hover:text-white',
          className
        )}
      />
    );
  }
);

export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; label: string }>(
  function IconButton({ active, label, className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        aria-label={label}
        title={label}
        {...props}
        className={twMerge(
          'p-2 rounded-lg transition-colors flex-shrink-0',
          active ? 'text-accent bg-accent-soft' : 'text-fg-muted hover:text-fg hover:bg-hover',
          className
        )}
      >
        {children}
      </button>
    );
  }
);

/* ---------- Form fields ---------- */

export const inputClass =
  'w-full bg-surface border border-line rounded-lg px-3 py-2 text-sm text-fg placeholder:text-fg-subtle outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition-all';

export function Field({ label, hint, children, className }: { label: React.ReactNode; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={twMerge('flex flex-col gap-1.5', className)}>
      <span className="text-xs font-medium text-fg-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-fg-subtle leading-relaxed">{hint}</span>}
    </label>
  );
}

export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={twMerge('text-[10px] font-semibold uppercase tracking-[0.18em] text-fg-subtle', className)}>{children}</div>;
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded border border-line bg-surface text-[10px] font-sans font-medium text-fg-subtle">
      {children}
    </kbd>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={twMerge('relative w-9 h-5 rounded-full transition-colors flex-shrink-0', checked ? 'bg-accent' : 'bg-line-strong')}
    >
      <span className={twMerge('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', checked && 'translate-x-4')} />
    </button>
  );
}

/* ---------- Popover menu ---------- */

export function Popover({
  trigger,
  children,
  align = 'right',
  className,
  side = 'bottom',
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: 'left' | 'right';
  side?: 'top' | 'bottom';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen(o => !o) })}
      {open && (
        <div
          className={twMerge(
            'absolute z-40 min-w-[200px] rounded-xl border border-line bg-elevated shadow-float p-1.5 animate-pop-in',
            align === 'right' ? 'right-0' : 'left-0',
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
            className
          )}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  danger,
  shortcut,
  disabled,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  shortcut?: string;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={twMerge(
        'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm text-left transition-colors disabled:opacity-40',
        danger ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-hover'
      )}
    >
      {icon && <span className={twMerge('w-4 h-4 flex items-center justify-center', danger ? '' : 'text-fg-muted')}>{icon}</span>}
      <span className="flex-1">{children}</span>
      {shortcut && <span className="text-[11px] text-fg-subtle">{shortcut}</span>}
    </button>
  );
}

export function MenuDivider() {
  return <div className="my-1 h-px bg-line" />;
}

/* ---------- Progress ring ---------- */

export function ProgressRing({ value, size = 18, stroke = 2.5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <svg width={size} height={size} className="-rotate-90 flex-shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-strong)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={pct >= 1 ? 'var(--success)' : 'var(--accent)'}
        strokeWidth={stroke}
        strokeDasharray={c}
        strokeDashoffset={c * (1 - pct)}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 400ms ease' }}
      />
    </svg>
  );
}

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';
