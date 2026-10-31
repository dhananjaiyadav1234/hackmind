import type { ReactNode } from 'react';
import { ExternalLink, FileText } from 'lucide-react';
import type { Source } from '../../../shared/types';
import { cn, hostOf } from '../../lib/format';

export function isHttpUrl(u: string | undefined | null): u is string {
  return !!u && /^https?:\/\//i.test(u);
}

/** External link that is safe by construction. Non-http(s) URLs render as plain text. */
export function ExtLink({ href, children, className }: { href?: string; children: ReactNode; className?: string }) {
  if (!isHttpUrl(href)) return <span className={className}>{children}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" className={cn('text-info underline-offset-2 hover:underline', className)}>
      {children}
    </a>
  );
}

/** Clickable provenance chips: sourceIds -> bundle.sources. Manual/demo sources are not links. */
export function SourceChips({ ids, sources }: { ids: string[]; sources: Source[] }) {
  if (!ids || ids.length === 0) return <span className="text-xs text-faint">No sources attached</span>;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Sources">
      {ids.map((id) => {
        const s = sources.find((x) => x.id === id);
        const base = 'inline-flex max-w-[16rem] items-center gap-1 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11px]';
        if (!s) {
          return (
            <li key={id} className={cn(base, 'text-faint')} title="Source not found in this workspace">
              <FileText className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">unknown source</span>
            </li>
          );
        }
        const label = s.title || hostOf(s.url);
        const linkable = s.kind !== 'manual' && s.kind !== 'demo' && isHttpUrl(s.url);
        return (
          <li key={id}>
            {linkable ? (
              <a href={s.url} target="_blank" rel="noreferrer noopener" title={s.url} className={cn(base, 'text-info hover:border-info/50')}>
                <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
              </a>
            ) : (
              <span className={cn(base, 'text-muted')} title={s.kind === 'demo' ? 'Bundled sample source (not a live web page)' : 'Entered manually'}>
                <FileText className="h-3 w-3 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
                <span className="text-faint">· {s.kind === 'demo' ? 'sample' : 'manual'}</span>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export function Chips({ items, tone = 'neutral' }: { items: string[]; tone?: 'neutral' | 'accent' }) {
  if (!items.length) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <li
          key={`${t}-${i}`}
          className={cn(
            'rounded-md border px-2 py-0.5 text-xs',
            tone === 'accent' ? 'border-accent/30 bg-accent/10 text-[#b3aaff]' : 'border-line bg-surface-2 text-fg/90',
          )}
        >
          {t}
        </li>
      ))}
    </ul>
  );
}

export function Bullets({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-fg/90 marker:text-faint">
      {items.map((t, i) => (
        <li key={`${i}-${t.slice(0, 20)}`}>{t}</li>
      ))}
    </ul>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-faint">{children}</div>;
}

export function parseLines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}
