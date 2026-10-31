import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { JudgePersona, JudgeSession } from '../../../shared/types';
import { api } from '../../lib/api';
import { timeAgo } from '../../lib/format';
import { useWorkspace } from '../../lib/workspace-context';
import { IdeaPicker } from '../../components/judge/IdeaPicker';
import { ReportView } from '../../components/judge/ReportView';
import { SessionView } from '../../components/judge/SessionView';
import { SetupPanel } from '../../components/judge/SetupPanel';
import { Badge, Card, CardBody, CardHeader, ErrorBanner, PageHeader, Spinner } from '../../components/ui';

export default function JudgeArena() {
  const { ideaId } = useParams();
  const { id: wid, bundle, loading } = useWorkspace();
  if (loading && !bundle) return <Spinner label="Loading workspace…" />;
  if (!bundle) return <ErrorBanner error="Workspace not available." />;
  if (!ideaId) {
    return (
      <div>
        <PageHeader title="Judge Arena" subtitle="Face an adversarial panel of AI judges. Pick an idea to defend." />
        <IdeaPicker wid={wid} ideas={bundle.ideas} basePath="judge" />
      </div>
    );
  }
  return <IdeaArena key={ideaId} wid={wid} ideaId={ideaId} />;
}

function IdeaArena({ wid, ideaId }: { wid: string; ideaId: string }) {
  const { ideaById } = useWorkspace();
  const idea = ideaById(ideaId);
  const [sessions, setSessions] = useState<JudgeSession[] | null>(null);
  const [session, setSession] = useState<JudgeSession | null>(null);
  const [mode, setMode] = useState<'setup' | 'session'>('setup');
  const [reviewing, setReviewing] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      setSessions(await api.judgeSessions(wid, ideaId));
    } catch (e) {
      setError((e as Error).message);
      setSessions([]);
    }
  }, [wid, ideaId]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function start(personas: JudgePersona[], maxFollowUps: number) {
    if (starting) return;
    setStarting(true);
    setError(null);
    try {
      const s = await api.startJudge(wid, ideaId, { personas, maxFollowUps });
      setSession(s);
      setMode('session');
      setReviewing(false);
      void loadSessions();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  }

  function update(s: JudgeSession) {
    setSession(s);
    setSessions((cur) => (cur ? cur.map((x) => (x.id === s.id ? s : x)) : cur));
    if (s.status === 'finished') setReviewing(false);
  }

  function open(s: JudgeSession, review = false) {
    setSession(s);
    setMode('session');
    setReviewing(review);
  }

  const showReport = mode === 'session' && session?.report && session.status === 'finished' && !reviewing;

  return (
    <div className="space-y-4">
      <Link to={`/w/${wid}/judge`} className="inline-flex items-center gap-1 text-xs text-muted hover:text-fg">
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> All ideas
      </Link>
      <PageHeader title={`Judge Arena${idea ? `: ${idea.title}` : ''}`} subtitle={idea?.pitch} />
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      {mode === 'setup' && (
        <>
          <SetupPanel starting={starting} onStart={(p, d) => void start(p, d)} />
          <Card>
            <CardHeader title="Past sessions" />
            <CardBody>
              {sessions === null && <Spinner />}
              {sessions?.length === 0 && <p className="text-sm text-muted">No sessions yet for this idea.</p>}
              <ul className="space-y-2">
                {sessions?.map((s) => {
                  const answered = s.turns.filter((t) => t.answer !== undefined).length;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface-2/40 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={s.status === 'finished' ? 'good' : 'info'}>{s.status}</Badge>
                        <span className="text-muted">{answered}/{s.turns.length} answered</span>
                        {s.report?.overall != null && <Badge tone="accent">Overall {s.report.overall.toFixed(1)}/10</Badge>}
                        <span className="text-xs text-faint">{timeAgo(s.updatedAt)}</span>
                      </div>
                      <button className="text-xs font-medium text-accent underline" onClick={() => open(s, s.status === 'finished' && !s.report)}>
                        {s.status === 'finished' ? 'Review' : 'Resume'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </>
      )}

      {mode === 'session' && session && (
        <>
          <div className="flex gap-3 text-xs">
            <button className="text-muted underline hover:text-fg" onClick={() => { setMode('setup'); void loadSessions(); }}>New session / past sessions</button>
            {session.report && session.status === 'finished' && reviewing && (
              <button className="text-muted underline hover:text-fg" onClick={() => setReviewing(false)}>Back to report</button>
            )}
          </div>
          {showReport && session.report ? (
            <ReportView report={session.report} wid={wid} ideaId={ideaId} onRestart={() => { setMode('setup'); void loadSessions(); }} onReview={() => setReviewing(true)} />
          ) : (
            <SessionView wid={wid} idea={idea} session={session} onUpdate={update} />
          )}
        </>
      )}
    </div>
  );
}
