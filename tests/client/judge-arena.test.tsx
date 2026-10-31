// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { makeBundle, makeSession, makeTurn, makeEvaluation, IDEA_ID, WID } from './judge-fixtures';

vi.mock('../../src/lib/api', () => ({
  api: { judgeSessions: vi.fn(), startJudge: vi.fn(), answerJudge: vi.fn(), finishJudge: vi.fn() },
  ApiError: class extends Error {},
}));
vi.mock('../../src/lib/workspace-context', () => {
  const bundle = makeBundle();
  return { useWorkspace: () => ({ id: WID, bundle, loading: false, ideaById: (i: string) => bundle.ideas.find((x) => x.id === i) }) };
});

import { api } from '../../src/lib/api';
import JudgeArena from '../../src/pages/workspace/JudgeArena';

const m = vi.mocked(api);

function renderArena() {
  return render(
    <MemoryRouter initialEntries={[`/w/${WID}/judge/${IDEA_ID}`]}>
      <Routes><Route path="/w/:wid/judge/:ideaId" element={<JudgeArena />} /></Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  m.judgeSessions.mockResolvedValue([]);
});
afterEach(cleanup);

describe('Judge Arena', () => {
  it('starts a session with the selected personas and depth', async () => {
    m.startJudge.mockResolvedValue(makeSession());
    renderArena();
    fireEvent.click(screen.getByRole('button', { name: /Aggressive Judge/ })); // deselect
    fireEvent.click(screen.getByRole('radio', { name: '2' }));
    fireEvent.click(screen.getByRole('button', { name: /Start judging session/ }));
    await waitFor(() => expect(m.startJudge).toHaveBeenCalledTimes(1));
    expect(m.startJudge).toHaveBeenCalledWith(WID, IDEA_ID, { personas: ['technical', 'innovation', 'business', 'sponsor', 'product'], maxFollowUps: 2 });
    expect(await screen.findByText('Why a queue?')).toBeTruthy();
    expect(screen.getByText(/What this judge is probing/)).toBeTruthy();
  });

  it('rejects an empty/short answer without calling the API', async () => {
    m.startJudge.mockResolvedValue(makeSession());
    renderArena();
    fireEvent.click(screen.getByRole('button', { name: /Start judging session/ }));
    await screen.findByText('Why a queue?');
    fireEvent.change(screen.getByLabelText(/Your answer/), { target: { value: 'too short' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit answer/ }));
    expect(await screen.findByText(/at least 15 characters/)).toBeTruthy();
    expect(m.answerJudge).not.toHaveBeenCalled();
  });

  it('renders evaluation, heuristic note and follow-up reason after answering', async () => {
    const start = makeSession();
    m.startJudge.mockResolvedValue(start);
    const answered = makeTurn({ answer: 'Because a queue decouples ingestion from processing.', evaluation: makeEvaluation() });
    const followUp = makeTurn({ id: 't2', parentTurnId: 't1', depth: 1, question: 'What about ordering?', followUpReason: 'You skipped ordering guarantees' });
    m.answerJudge.mockResolvedValue(makeSession([answered, followUp]));
    renderArena();
    fireEvent.click(screen.getByRole('button', { name: /Start judging session/ }));
    await screen.findByText('Why a queue?');
    fireEvent.change(screen.getByLabelText(/Your answer/), { target: { value: 'Because a queue decouples ingestion from processing.' } });
    fireEvent.click(screen.getByRole('button', { name: /Submit answer/ }));
    await waitFor(() => expect(m.answerJudge).toHaveBeenCalledWith(WID, 'sess1', 't1', 'Because a queue decouples ingestion from processing.'));
    expect(await screen.findByTestId('eval-overall')).toHaveProperty('textContent', '7.5');
    expect(screen.getByText(/rule-based and shallow/)).toBeTruthy();
    expect(screen.getByText('Follow-up: You skipped ordering guarantees')).toBeTruthy();
    expect(screen.getByText('What about ordering?')).toBeTruthy();
    expect(screen.getByTestId('progress-label').textContent).toContain('1/2');
    expect(screen.getAllByText('No signal from this answer').length).toBeGreaterThan(0);
  });
});
