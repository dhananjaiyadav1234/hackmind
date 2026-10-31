import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { Cpu } from 'lucide-react';
import type { SystemStatus } from '../shared/types';
import { api } from './lib/api';
import { Badge } from './components/ui';
import Dashboard from './pages/Dashboard';
import WorkspaceLayout from './components/WorkspaceLayout';
import Overview from './pages/workspace/Overview';
import Intelligence from './pages/workspace/Intelligence';
import Sponsors from './pages/workspace/Sponsors';
import Opportunities from './pages/workspace/Opportunities';
import Ideas from './pages/workspace/Ideas';
import Compare from './pages/workspace/Compare';
import IdeaDetail from './pages/workspace/IdeaDetail';
import JudgeArena from './pages/workspace/JudgeArena';
import BlueprintPage from './pages/workspace/BlueprintPage';
import Sources from './pages/workspace/Sources';

function TopBar() {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  useEffect(() => {
    api.status().then(setStatus).catch(() => undefined);
  }, []);
  return (
    <header className="border-b border-line bg-bg/70 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-2.5 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-sm font-bold text-white">H</span>
          <span>HACKMIND</span>
          <span className="hidden text-xs font-normal text-faint sm:inline">Hackathon intelligence & preparation</span>
        </Link>
        {status && (
          <Badge
            tone={status.engine === 'llm' ? 'good' : 'warn'}
            title={status.notes.join(' ')}
            className="gap-1.5"
          >
            <Cpu className="h-3 w-3" aria-hidden />
            {status.engine === 'llm' ? `Claude agents · ${status.llm.model}` : 'Heuristic demo engine (no LLM key)'}
          </Badge>
        )}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="flex min-h-full flex-col">
      <TopBar />
      <div className="flex-1">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/w/:wid" element={<WorkspaceLayout />}>
            <Route index element={<Overview />} />
            <Route path="intelligence" element={<Intelligence />} />
            <Route path="sponsors" element={<Sponsors />} />
            <Route path="opportunities" element={<Opportunities />} />
            <Route path="ideas" element={<Ideas />} />
            <Route path="ideas/:ideaId" element={<IdeaDetail />} />
            <Route path="compare" element={<Compare />} />
            <Route path="judge" element={<JudgeArena />} />
            <Route path="judge/:ideaId" element={<JudgeArena />} />
            <Route path="blueprint" element={<BlueprintPage />} />
            <Route path="blueprint/:ideaId" element={<BlueprintPage />} />
            <Route path="sources" element={<Sources />} />
          </Route>
          <Route path="*" element={<div className="p-10 text-muted">Page not found. <Link className="text-info underline" to="/">Back to workspaces</Link></div>} />
        </Routes>
      </div>
    </div>
  );
}
