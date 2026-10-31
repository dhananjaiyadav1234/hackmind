import { Link } from 'react-router-dom';
import { Crown, Star, X, RotateCcw } from 'lucide-react';
import type { Idea, IdeaTier } from '../../../shared/types';
import { Badge, Button } from '../ui';
import { cn } from '../../lib/format';
import { EngineBadge, FEAS_TONE, IdeaStatusBadge, LEVEL_TONE, ScoreRing, TIER_BLURB, TIER_LABELS, TIER_ORDER, sortIdeasByRank, topSponsors } from './shared';

export interface IdeaActions {
  selected: Set<string>;
  maxSelected: boolean;
  onToggle: (id: string) => void;
  onStatus: (id: string, status: 'shortlisted' | 'eliminated' | 'generated') => void;
  pendingId: string | null;
  wid: string;
  recommendedId: string | null;
}

export function IdeaQuickActions({ idea, a }: { idea: Idea; a: IdeaActions }) {
  const pending = a.pendingId === idea.id;
  return (
    <div className="flex flex-wrap gap-1.5">
      {idea.status === 'generated' || idea.status === 'eliminated' ? (
        <Button size="sm" variant="secondary" loading={pending} onClick={() => a.onStatus(idea.id, 'shortlisted')} aria-label={`Shortlist ${idea.title}`}>
          <Star className="h-3 w-3" aria-hidden /> Shortlist
        </Button>
      ) : null}
      {idea.status !== 'eliminated' ? (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => a.onStatus(idea.id, 'eliminated')} aria-label={`Eliminate ${idea.title}`}>
          <X className="h-3 w-3" aria-hidden /> Eliminate
        </Button>
      ) : (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => a.onStatus(idea.id, 'generated')} aria-label={`Restore ${idea.title}`}>
          <RotateCcw className="h-3 w-3" aria-hidden /> Restore
        </Button>
      )}
    </div>
  );
}

export function SelectBox({ idea, a }: { idea: Idea; a: IdeaActions }) {
  const checked = a.selected.has(idea.id);
  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={!checked && a.maxSelected}
      onChange={() => a.onToggle(idea.id)}
      aria-label={`Select ${idea.title} for comparison`}
      className="h-4 w-4 shrink-0 accent-[#7b6cff]"
    />
  );
}

export function IdeaCard({ idea, a }: { idea: Idea; a: IdeaActions }) {
  const recommended = idea.id === a.recommendedId || idea.status === 'recommended';
  const sponsors = topSponsors(idea, 2);
  return (
    <article
      className={cn(
        'hm-in rounded-xl border bg-surface-2/60 p-3.5 transition-colors',
        recommended ? 'border-good/50 shadow-[0_0_0_1px_rgba(62,207,142,0.25)]' : 'border-line hover:border-line-strong',
        idea.status === 'eliminated' && 'opacity-60',
      )}
      aria-label={idea.title}
    >
      <div className="flex items-start gap-3">
        <SelectBox idea={idea} a={a} />
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="font-mono text-[11px] text-faint">{idea.rank ? `#${idea.rank}` : 'unranked'}</span>
            {recommended && (
              <Badge tone="good">
                <Crown className="h-3 w-3" aria-hidden /> Recommended
              </Badge>
            )}
            <IdeaStatusBadge status={idea.status} />
          </div>
          <h4 className="text-sm font-semibold leading-snug">
            <Link to={`/w/${a.wid}/ideas/${idea.id}`} className="text-fg hover:text-[#b3aaff] hover:underline">
              {idea.title}
            </Link>
          </h4>
          <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">{idea.pitch}</p>
        </div>
        <ScoreRing value={idea.scores?.total ?? null} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Badge tone={LEVEL_TONE[idea.complexity.level]} title={`~${idea.complexity.estimatedHours}h`}>
          complexity {idea.complexity.level}
        </Badge>
        <Badge tone={FEAS_TONE[idea.feasibility.level]}>feasibility {idea.feasibility.level}</Badge>
        {sponsors.map((s) => (
          <Badge key={s} tone="info">
            {s}
          </Badge>
        ))}
        <EngineBadge engine={idea.engine} />
      </div>
      <div className="mt-3 border-t border-line pt-2.5">
        <IdeaQuickActions idea={idea} a={a} />
      </div>
    </article>
  );
}

export function IdeaBoard({ ideas, a }: { ideas: Idea[]; a: IdeaActions }) {
  const byTier = (t: IdeaTier) => ideas.filter((i) => i.tier === t).sort(sortIdeasByRank);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
      {TIER_ORDER.map((tier) => {
        const list = byTier(tier);
        return (
          <section key={tier} aria-labelledby={`tier-${tier}`} className="min-w-0">
            <div className="mb-2.5 px-0.5">
              <h3 id={`tier-${tier}`} className="flex items-center gap-2 text-sm font-semibold">
                {TIER_LABELS[tier]}
                <span className="rounded-full bg-surface-3 px-1.5 py-0.5 text-[10px] text-muted">{list.length}</span>
              </h3>
              <p className="text-xs text-faint">{TIER_BLURB[tier]}</p>
            </div>
            <div className="flex flex-col gap-3">
              {list.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-faint">No ideas in this tier.</div>
              ) : (
                list.map((i) => <IdeaCard key={i.id} idea={i} a={a} />)
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
