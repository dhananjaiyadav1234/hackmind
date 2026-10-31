import 'dotenv/config';
import { loadConfig } from './config';
import { Store } from './db';
import { createLlm } from './llm';
import { LlmEngine } from './agents/llm-engine';
import { HeuristicEngine } from './agents/heuristic';
import { LiveResearch } from './research/live';
import { DemoResearch } from './research/demo';
import { EventBus, type Deps } from './pipeline/core';
import { createApp } from './app';
import type { Research } from './research/types';

const cfg = loadConfig();
const store = new Store(cfg.dbFile);
const llm = createLlm(cfg);
const engine = llm ? new LlmEngine(llm) : new HeuristicEngine();
const research: Research = new LiveResearch(cfg);
const deps: Deps = { store, engine, research, demoResearch: new DemoResearch(), bus: new EventBus() };
const { app, runner } = createApp(deps, cfg);
runner.recoverInterrupted();

const server = app.listen(cfg.port, '127.0.0.1', () => {
  console.log(`HACKMIND API listening on http://127.0.0.1:${cfg.port}  (engine: ${engine.label}${llm ? `, model ${llm.model}` : ''})`);
  if (!llm) console.log('No ANTHROPIC_API_KEY — running the heuristic demo engine. See README for configuration.');
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    server.close(() => { store.close(); process.exit(0); });
  });
}
