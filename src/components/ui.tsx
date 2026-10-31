import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import ReactMarkdown from 'react-markdown';
import { Loader2 } from 'lucide-react';
import { cn } from '../lib/format';

export type Tone = 'neutral' | 'accent' | 'good' | 'warn' | 'bad' | 'info';

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-3 text-muted border-line',
  accent: 'bg-accent/15 text-[#b3aaff] border-accent/30',
  good: 'bg-good/12 text-good border-good/30',
  warn: 'bg-warn/12 text-warn border-warn/30',
  bad: 'bg-bad/12 text-bad border-bad/30',
  info: 'bg-info/12 text-info border-info/30',
};

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap', toneClasses[tone], className)}>
      {children}
    </span>
  );
}

export function Card({ children, className, as: Tag = 'div' }: { children: ReactNode; className?: string; as?: 'div' | 'section' | 'article' }) {
  return <Tag className={cn('rounded-xl border border-line bg-surface/90 backdrop-blur-sm', className)}>{children}</Tag>;
}

export function CardHeader({ title, subtitle, right, className }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-3 border-b border-line px-4 py-3', className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold tracking-tight text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
const btnClasses: Record<BtnVariant, string> = {
  primary: 'bg-accent text-white hover:bg-[#8e80ff] shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]',
  secondary: 'bg-surface-3 text-fg border border-line-strong hover:bg-line',
  ghost: 'text-muted hover:text-fg hover:bg-surface-3',
  danger: 'bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25',
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; loading?: boolean; size?: 'sm' | 'md' }>(
  ({ variant = 'secondary', loading, size = 'md', className, children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm',
        btnClasses[variant],
        className,
      )}
      {...rest}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

const fieldBase = 'w-full rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-sm text-fg placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(fieldBase, className)} {...p} />
));
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'min-h-24 resize-y', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-xs font-medium text-muted">
      {children}
      {hint && <span className="ml-2 font-normal text-faint">{hint}</span>}
    </label>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted" role="status">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label ?? 'Loading…'}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      {icon && <div className="mb-3 text-faint">{icon}</div>}
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBanner({ error, onDismiss }: { error: string | null | undefined; onDismiss?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-sm text-bad">
      <span>{error}</span>
      {onDismiss && (
        <button onClick={onDismiss} className="text-xs underline">
          Dismiss
        </button>
      )}
    </div>
  );
}

export function ProgressBar({ value, max = 100, tone = 'accent', className }: { value: number; max?: number; tone?: 'accent' | 'good' | 'warn' | 'bad'; className?: string }) {
  const p = Math.max(0, Math.min(100, (value / (max || 1)) * 100));
  const color = { accent: 'bg-accent', good: 'bg-good', warn: 'bg-warn', bad: 'bg-bad' }[tone];
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-surface-3', className)} role="progressbar" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all duration-500', color)} style={{ width: `${p}%` }} />
    </div>
  );
}

/** 0–10 score bar with numeric value. */
export function ScoreBar({ score, label, className }: { score: number | null; label?: ReactNode; className?: string }) {
  const tone = score === null ? 'accent' : score >= 7 ? 'good' : score >= 5 ? 'warn' : 'bad';
  return (
    <div className={cn('flex items-center gap-3', className)}>
      {label && <div className="w-40 shrink-0 truncate text-xs text-muted">{label}</div>}
      <ProgressBar value={score ?? 0} max={10} tone={tone} className="flex-1" />
      <div className="w-8 shrink-0 text-right font-mono text-xs tabular-nums text-fg">{score === null ? '—' : score.toFixed(1)}</div>
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface-2/60 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wider text-faint">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums text-fg">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (id: T) => void; className?: string }) {
  return (
    <div role="tablist" className={cn('flex gap-1 overflow-x-auto border-b border-line', className)}>
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
            value === t.id ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Markdown({ children, className }: { children: string; className?: string }) {
  // react-markdown does not render raw HTML by default — safe for model/web-derived text.
  return (
    <div className={cn('prose-hm text-sm text-fg/90', className)}>
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}

export function Disclosure({ title, children, defaultOpen = false, right }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean; right?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-line bg-surface-2/40">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-medium text-fg">
        <span className="min-w-0 truncate">{title}</span>
        <span className="flex items-center gap-2 text-xs text-faint">
          {right}
          {open ? '−' : '+'}
        </span>
      </button>
      {open && <div className="border-t border-line px-3 py-3">{children}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-fg sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-3xl text-sm text-muted">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}

const statusTone: Record<string, Tone> = {
  verified: 'good', sourced: 'good', researched: 'good', done: 'good', succeeded: 'good',
  partially_verified: 'warn', assumed: 'warn', assumption: 'warn', partial: 'warn', stale: 'warn', running: 'info', queued: 'info',
  unverified: 'bad', unavailable: 'bad', contradicted: 'bad', failed: 'bad', cancelled: 'bad',
  idle: 'neutral',
};

/** Consistent verification / status pill used everywhere. */
export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <Badge tone={statusTone[status] ?? 'neutral'}>{label ?? status.replace(/_/g, ' ')}</Badge>;
}
