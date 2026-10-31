// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { makeBundle } from './fixtures';

const mocks = vi.hoisted(() => ({
  api: {
    status: vi.fn(),
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    setIntelField: vi.fn(),
    updateWorkspace: vi.fn(),
    addSource: vi.fn(),
  },
  ws: { current: null as unknown },
}));

vi.mock('../../src/lib/api', () => ({ api: mocks.api }));
vi.mock('../../src/lib/workspace-context', () => ({ useWorkspace: () => mocks.ws.current }));
vi.mock('../../src/components/AgentActivity', () => ({ AgentActivity: () => <div>activity</div> }));

import Dashboard from '../../src/pages/Dashboard';
import Intelligence from '../../src/pages/workspace/Intelligence';
import Overview from '../../src/pages/workspace/Overview';
import Sources from '../../src/pages/workspace/Sources';

function ctx(over: Record<string, unknown> = {}) {
  return {
    id: 'w1', bundle: makeBundle(), loading: false, error: null, refresh: vi.fn().mockResolvedValue(undefined), events: [], activeJobs: [], busy: false,
    runStage: vi.fn().mockResolvedValue(undefined), clearError: vi.fn(), setError: vi.fn(), ideaById: vi.fn(), ...over,
  };
}

beforeEach(() => {
  mocks.api.status.mockResolvedValue({ version: '1', engine: 'heuristic', llm: { configured: false, provider: null, model: null }, research: { providers: [] }, demoMode: true, notes: [] });
  mocks.api.listWorkspaces.mockResolvedValue([]);
  mocks.ws.current = ctx();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('workspace pages', () => {
  it('Dashboard demo button creates a demo workspace and navigates', async () => {
    mocks.api.createWorkspace.mockResolvedValue({ workspace: { id: 'abc' } });
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/w/:id" element={<div>workspace-page</div>} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText(/No workspaces yet/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Try the demo workspace/ }));
    await waitFor(() => expect(mocks.api.createWorkspace).toHaveBeenCalledWith({ demo: true }));
    expect(await screen.findByText('workspace-page')).toBeTruthy();
  });

  it('Intelligence renders verified / assumed / unavailable badges and derived weights', () => {
    render(<MemoryRouter><Intelligence /></MemoryRouter>);
    expect(screen.getAllByText('verified').length).toBeGreaterThan(1);
    expect(screen.getAllByText('assumed').length).toBeGreaterThan(1);
    expect(screen.getAllByText('unavailable').length).toBeGreaterThan(1);
    expect(screen.getByText('How ideas will be scored')).toBeTruthy();
    expect(screen.getAllByText('Innovation').length).toBeGreaterThan(0);
  });

  it('Intelligence edit saves via setIntelField', async () => {
    mocks.api.setIntelField.mockResolvedValue({});
    render(<MemoryRouter><Intelligence /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Edit Themes & tracks' }));
    fireEvent.change(screen.getByLabelText('Themes & tracks'), { target: { value: 'A\nB\n' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(mocks.api.setIntelField).toHaveBeenCalledWith('w1', 'themes', ['A', 'B']));
  });

  it('Overview run-full triggers runStage(full) and is disabled while busy', () => {
    const c = ctx();
    mocks.ws.current = c;
    const { rerender } = render(<MemoryRouter><Overview /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: /Run full pipeline/ }));
    expect(c.runStage).toHaveBeenCalledWith('full');
    mocks.ws.current = ctx({ busy: true });
    rerender(<MemoryRouter><Overview /></MemoryRouter>);
    expect((screen.getByRole('button', { name: /Run full pipeline/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Sources shows empty state', () => {
    render(<MemoryRouter><Sources /></MemoryRouter>);
    expect(screen.getByText('No sources yet')).toBeTruthy();
  });
});
