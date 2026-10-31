import { useState } from 'react';
import { NavLink, Outlet, useParams } from 'react-router-dom';
import { Activity, BookOpen, Briefcase, FlaskConical, GitCompare, Gavel, Lightbulb, LayoutDashboard, Link2, ScrollText, Target } from 'lucide-react';
import { WorkspaceProvider, useWorkspace } from '../lib/workspace-context';
import { Badge, ErrorBanner, Spinner } from './ui';
import { AgentActivity } from './AgentActivity';
import { cn } from '../lib/format';

const NAV = [
  { to: '', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: 'intelligence', label: 'Intelligence', icon: BookOpen },
  { to: 'sponsors', label: 'Sponsors', icon: Briefcase },
  { to: 'opportunities', label: 'Opportunities', icon: Target },
  { to: 'ideas', label: 'Ideas', icon: Lightbulb },
  { to: 'compare', label: 'Compare', icon: GitCompare },
  { to: 'judge', label: 'Judge Arena', icon: Gavel },
  { to: 'blueprint', label: 'Blueprint', icon: ScrollText },
  { to: 'sources', label: 'Sources', icon: Link2 },
];

export default function WorkspaceLayout() {
  const { wid } = useParams();
  if (!wid) return null;
  return (
    <WorkspaceProvider id={wid}>
      <Inner />
    </WorkspaceProvider>
  );
}

function Inner() {
  const { bundle, loading, error, clearError, busy } = useWorkspace();
  const [activityOpen, setActivityOpen] = useState(false);

  if (loading && !bundle) {
    return (
      <div className="p-8">
        <Spinner label="Loading workspace…" />
      </div>
    );
  }
  if (!bundle) {
    return (
      <div className="p-8">
        <ErrorBanner error={error ?? 'Workspace not found'} />
      </div>
    );
  }
  const w = bundle.workspace;

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 pt-3 sm:px-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 shrink-0 text-accent" aria-hidden />
              <h2 className="truncate text-base font-semibold tracking-tight">{w.name}</h2>
              {w.mode === 'demo' && <Badge tone="warn" title="Bundled fictional sample data">Sample data</Badge>}
              {busy && (
                <Badge tone="info">
                  <span className="hm-pulse">●</span> Agents working
                </Badge>
              )}
            </div>
          </div>
          <button
            onClick={() => setActivityOpen(!activityOpen)}
            className="flex items-center gap-1.5 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs text-muted hover:text-fg"
            aria-pressed={activityOpen}
          >
            <Activity className="h-3.5 w-3.5" aria-hidden /> Agent activity
          </button>
        </div>
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 sm:px-5" aria-label="Workspace sections">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={label}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  '-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
                )
              }
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-6 sm:px-6">
        <main className="min-w-0 flex-1">
          {error && (
            <div className="mb-4">
              <ErrorBanner error={error} onDismiss={clearError} />
            </div>
          )}
          <Outlet />
        </main>
        {activityOpen && (
          <aside className="hidden w-80 shrink-0 lg:block" aria-label="Agent activity">
            <div className="sticky top-28">
              <AgentActivity compact />
            </div>
          </aside>
        )}
      </div>
      {activityOpen && (
        <div className="fixed inset-x-0 bottom-0 z-30 max-h-[55vh] overflow-auto border-t border-line-strong bg-surface p-3 lg:hidden">
          <AgentActivity compact />
        </div>
      )}
    </div>
  );
}
