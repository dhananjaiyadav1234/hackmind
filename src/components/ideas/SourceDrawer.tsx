import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Source } from '../../../shared/types';
import { Badge, Button } from '../ui';
import { ExtLink } from './shared';
import { timeAgo } from '../../lib/format';

/** Inline panel for inspecting the evidence behind a source. Content is rendered as plain text. */
export function SourceDrawer({ source, missingId, onClose }: { source: Source | null; missingId?: string | null; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Source inspector"
        onClick={(e) => e.stopPropagation()}
        className="hm-in flex h-full w-full max-w-xl flex-col border-l border-line-strong bg-surface shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-faint">Source</div>
            <h3 className="break-words text-sm font-semibold">{source ? source.title || source.url : `Source ${missingId}`}</h3>
          </div>
          <Button ref={closeRef} size="sm" variant="ghost" onClick={onClose} aria-label="Close source inspector">
            <X className="h-4 w-4" aria-hidden />
          </Button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
          {!source ? (
            <p className="text-muted">This source is referenced but its content was not captured, so it cannot be inspected.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{source.kind}</Badge>
                <Badge tone="info">via {source.provider}</Badge>
                <span className="text-xs text-faint">fetched {timeAgo(source.fetchedAt)}</span>
              </div>
              <div className="break-all text-xs"><ExtLink href={source.url}>{source.url}</ExtLink></div>
              <section>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Snippet</h4>
                <p className="whitespace-pre-wrap text-fg/90">{source.snippet || '—'}</p>
              </section>
              <section>
                <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">Captured content</h4>
                <pre className="max-h-[50vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-line bg-surface-2 p-3 font-mono text-xs text-muted">{source.content || 'No content captured.'}</pre>
              </section>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
