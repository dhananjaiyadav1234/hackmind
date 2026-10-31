// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { FIXTURE_IDEAS, makeBundle } from './ideas-fixtures';

vi.mock('../../src/lib/api');
const runStage = vi.fn();
const refresh = vi.fn();
vi.mock('../../src/lib/workspace-context', () => ({
  useWorkspace: () => ({ bundle: makeBundle(), busy: false, runStage, refresh, error: null, clearError: vi.fn() }),
}));

import Ideas from '../../src/pages/workspace/Ideas';
import { api } from '../../src/lib/api';

function Where() {
  const l = useLocation();
  return <div data-testid="loc">{l.pathname + l.search}</div>;
}

function renderIdeas() {
  return render(
    <MemoryRouter initialEntries={['/w/w1/ideas']}>
      <Routes>
        <Route path="/w/:wid/ideas" element={<Ideas />} />
        <Route path="/w/:wid/compare" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('Ideas board', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it('groups ideas by tier, hides eliminated by default and shows the disclaimer', () => {
    renderIdeas();
    expect(screen.getByText(/not a prediction of winning/i)).toBeTruthy();
    const safe = screen.getByRole('heading', { name: /Safe Winners/ }).closest('section')!;
    expect(within(safe).getByText('Safe Alpha')).toBeTruthy();
    expect(within(safe).queryByText('Eliminated Delta')).toBeNull();
    const moon = screen.getByRole('heading', { name: /Moonshots/ }).closest('section')!;
    expect(within(moon).getByText('Moonshot Gamma')).toBeTruthy();
    expect(screen.getAllByText('Recommended').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByLabelText(/Show eliminated/));
    expect(within(safe).getByText('Eliminated Delta')).toBeTruthy();
  });

  it('navigates to compare with the selected ids (2–4)', () => {
    renderIdeas();
    const btn = screen.getByRole('button', { name: /Compare/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(`Select ${FIXTURE_IDEAS[0].title} for comparison`));
    fireEvent.click(screen.getByLabelText(`Select ${FIXTURE_IDEAS[1].title} for comparison`));
    expect((screen.getByRole('button', { name: /Compare/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Compare/ }));
    expect(screen.getByTestId('loc').textContent).toBe('/w/w1/compare?ids=i1,i2');
  });

  it('shortlists via api.patchIdea and refreshes; runs stages', async () => {
    vi.mocked(api.patchIdea).mockResolvedValue(FIXTURE_IDEAS[2]);
    renderIdeas();
    fireEvent.click(screen.getByRole('button', { name: 'Shortlist Moonshot Gamma' }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(api.patchIdea).toHaveBeenCalledWith('w1', 'i3', { status: 'shortlisted' });
    fireEvent.click(screen.getByRole('button', { name: /Evolve shortlist/ }));
    expect(runStage).toHaveBeenCalledWith('evolve');
  });

  it('ranking table sorts by a criterion', () => {
    renderIdeas();
    fireEvent.click(screen.getByRole('button', { name: 'Ranking table' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Total' }));
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows[0].textContent).toContain('Safe Alpha');
  });
});
