import { Link } from 'react-router-dom';
import { Gavel } from 'lucide-react';
import type { Idea } from '../../../shared/types';
import { Badge, Card, EmptyState, StatusBadge } from '../ui';

const statusRank: Record<string, number> = { recommended: 0, validated: 1, shortlisted: 2, generated: 3 };

export function judgeableIdeas(ideas: Idea[]): Idea[] {
  return ideas
    .filter((i) => i.status !== 'eliminated')
    .sort((a, b) => (statusRank[a.status] ?? 9) - (statusRank[b.status] ?? 9) || (b.scores?.total ?? -1) - (a.scores?.total ?? -1));
}

export function IdeaPicker({ wid, ideas, basePath }: { wid: string; ideas: Idea[]; basePath: 'judge' | 'blueprint' }) {
  const list = judgeableIdeas(ideas);
  if (!list.length) {
    return <EmptyState icon={<Gavel className="h-8 w-8" />} title="No ideas to work with yet">Run the idea pipeline first, then come back.</EmptyState>;
  }
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
      {list.map((i) => (
        <li key={i.id}>
          <Link to={`/w/${wid}/${basePath}/${i.id}`} className="block h-full focus-visible:outline-2 focus-visible:outline-accent">
            <Card className="h-full p-4 transition-colors hover:border-accent/50">
              <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                <StatusBadge status={i.status} />
                <Badge>{i.tier}</Badge>
                {i.scores && <Badge tone="accent">{i.scores.total.toFixed(0)}/100</Badge>}
              </div>
              <h3 className="text-sm font-semibold">{i.title}</h3>
              <p className="mt-1 line-clamp-2 text-xs text-muted">{i.pitch}</p>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
