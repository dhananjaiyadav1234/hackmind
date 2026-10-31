// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CRITERIA } from '../../shared/types';
import { FIXTURE_IDEAS, makeBundle, makeClaim, makeDetail } from './ideas-fixtures';

vi.mock('../../src/lib/api');
vi.mock('../../src/lib/workspace-context', () => ({
  useWorkspace: () => ({ bundle: makeBundle(), busy: false, runStage: vi.fn(), refresh: vi.fn(), error: null, clearError: vi.fn() }),
}));

import IdeaDetail from '../../src/pages/workspace/IdeaDetail';
import Compare from '../../src/pages/workspace/Compare';
import { api } from '../../src/lib/api';

function renderDetail(tab?: string) {
  return render(
    <MemoryRouter initialEntries={[`/w/w1/ideas/i1${tab ? `?tab=${tab}` : ''}`]}>
      <Routes>
        <Route path="/w/:wid/ideas/:ideaId" element={<IdeaDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Idea detail', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('scoring tab: weighted contributions sum to the total', async () => {
    vi.mocked(api.idea).mockResolvedValue(makeDetail(FIXTURE_IDEAS[0]));
    renderDetail('scoring');
    const sumEl = await screen.findByTestId('contrib-sum');
    const total = Number(screen.getByTestId('total-score').textContent);
    expect(Math.abs(Number(sumEl.textContent) - total)).toBeLessThanOrEqual(0.1);
    const parts = CRITERIA.map((c) => Number(screen.getByTestId(`contrib-${c}`).textContent));
    expect(Math.abs(parts.reduce((a, b) => a + b, 0) - total)).toBeLessThanOrEqual(0.7);
  });

  it('evidence tab: shows contradicted/unverified badges, filters, and opens the source drawer as text', async () => {
    const claims = [
      makeClaim({ id: 'c1', text: 'Nobody solves this', status: 'contradicted', sourceIds: ['s1'], kind: 'differentiation' }),
      makeClaim({ id: 'c2', text: 'Market is huge', status: 'unverified' }),
      makeClaim({ id: 'c3', text: 'API exists', status: 'verified', kind: 'technical' }),
    ];
    vi.mocked(api.idea).mockResolvedValue(makeDetail(FIXTURE_IDEAS[0], claims));
    renderDetail('evidence');
    expect((await screen.findAllByText('contradicted')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('unverified').length).toBeGreaterThan(0);
    expect(screen.getByText(/Assumptions & unverified claims/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^verified \(1\)/ }));
    expect(within(screen.getByRole('table', { name: /Claims and their verification/ })).queryByText('Market is huge')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^All/ }));
    fireEvent.click(screen.getByTitle(/Example doc/));
    const dlg = screen.getByRole('dialog');
    expect(dlg.textContent).toContain('Captured page text <b>not html</b>');
  });

  it('evidence tab: honest empty state; 404 shows not-found', async () => {
    vi.mocked(api.idea).mockResolvedValue(makeDetail(FIXTURE_IDEAS[0]));
    renderDetail('evidence');
    expect(await screen.findByText(/Run deep validation to build the evidence workspace/)).toBeTruthy();
    cleanup();
    vi.mocked(api.idea).mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }));
    renderDetail();
    expect(await screen.findByText('Idea not found')).toBeTruthy();
  });
});

describe('Compare', () => {
  afterEach(cleanup);
  it('renders matrix with best highlights and a leader summary', async () => {
    render(
      <MemoryRouter initialEntries={['/w/w1/compare?ids=i1,i2,i3']}>
        <Routes><Route path="/w/:wid/compare" element={<Compare />} /></Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText(/Why the leader leads/)).toBeTruthy());
    expect(screen.getAllByText('best').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Radar chart/ })).toBeTruthy();
  });
});
