// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { makeBundle, makeBlueprint, IDEA_ID, WID } from './judge-fixtures';

vi.mock('../../src/lib/api', () => {
  class ApiError extends Error { constructor(m: string, public status: number) { super(m); } }
  return { ApiError, api: { getBlueprint: vi.fn(), generateBlueprint: vi.fn(), blueprintMarkdownUrl: (w: string, i: string) => `/api/workspaces/${w}/ideas/${i}/blueprint.md` } };
});
vi.mock('../../src/lib/workspace-context', () => {
  const bundle = makeBundle();
  return { useWorkspace: () => ({ id: WID, bundle, loading: false }) };
});

import { api, ApiError } from '../../src/lib/api';
import BlueprintPage from '../../src/pages/workspace/BlueprintPage';

const m = vi.mocked(api);
const renderPage = () =>
  render(
    <MemoryRouter initialEntries={[`/w/${WID}/blueprint`]}>
      <Routes><Route path="/w/:wid/blueprint/:ideaId?" element={<BlueprintPage />} /></Routes>
    </MemoryRouter>,
  );

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('Blueprint page', () => {
  it('defaults to the recommended idea and renders milestones proportional to hours', async () => {
    m.getBlueprint.mockResolvedValue(makeBlueprint());
    renderPage();
    const bars = await screen.findAllByTestId('milestone-bar');
    expect(m.getBlueprint).toHaveBeenCalledWith(WID, IDEA_ID);
    expect(bars).toHaveLength(2);
    expect(Number(bars[0].getAttribute('data-left'))).toBeCloseTo(0);
    expect(Number(bars[0].getAttribute('data-width'))).toBeCloseTo(25); // 6/24
    expect(Number(bars[1].getAttribute('data-left'))).toBeCloseTo(25);
    expect(Number(bars[1].getAttribute('data-width'))).toBeCloseTo(50); // 12/24
    expect(screen.getByText('Based on 24h event')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Download Markdown' }).getAttribute('href')).toBe(`/api/workspaces/${WID}/ideas/${IDEA_ID}/blueprint.md`);
  });

  it('shows an empty state on 404 and generates with default hours/team', async () => {
    m.getBlueprint.mockRejectedValue(new ApiError('nope', 404));
    m.generateBlueprint.mockResolvedValue(makeBlueprint());
    renderPage();
    expect(await screen.findByText('No blueprint yet')).toBeTruthy();
    expect((screen.getByLabelText('Hackathon hours') as HTMLInputElement).value).toBe('24');
    expect((screen.getByLabelText('Team size') as HTMLInputElement).value).toBe('3');
    screen.getByRole('button', { name: /Generate blueprint/ }).click();
    await waitFor(() => expect(m.generateBlueprint).toHaveBeenCalledWith(WID, IDEA_ID, { hours: 24, teamSize: 3 }));
    expect(await screen.findAllByTestId('milestone-bar')).toHaveLength(2);
  });
});
