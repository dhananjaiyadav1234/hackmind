import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { loadConfig } from '../server/config';
import { Store } from '../server/db';
import { HeuristicEngine } from '../server/agents/heuristic';
import { DemoResearch } from '../server/research/demo';
import { EventBus, type Deps } from '../server/pipeline/core';
import { createApp } from '../server/app';
import type { Research } from '../server/research/types';
import type { Engine } from '../server/agents/engine';

export class OfflineResearch implements Research {
  status() { return []; }
  drainWarnings() { return []; }
  async webSearch() { return []; }
  async paperSearch() { return []; }
  async repoSearch() { return []; }
  async fetchPage() { return null; }
}

export async function startTestServer(opts: { research?: Research; engine?: Engine } = {}) {
  const cfg = loadConfig({ NODE_ENV: 'test', HACKMIND_DB_FILE: ':memory:' } as NodeJS.ProcessEnv);
  const store = new Store(':memory:');
  const deps: Deps = { store, engine: opts.engine ?? new HeuristicEngine(), research: opts.research ?? new OfflineResearch(), demoResearch: new DemoResearch(), bus: new EventBus() };
  const { app, runner } = createApp(deps, cfg);
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  async function call<T = any>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const res = await fetch(base + path, { method, headers: body !== undefined ? { 'content-type': 'application/json' } : undefined, body: body !== undefined ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let parsed: unknown = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* markdown etc. */ }
    return { status: res.status, body: parsed as T };
  }
  return { base, call, deps, runner, store, close: () => new Promise<void>((r) => server.close(() => { store.close(); r(); })) };
}
