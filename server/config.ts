import path from 'node:path';

export interface AppConfig {
  port: number;
  dataDir: string;
  dbFile: string;
  anthropicApiKey: string | null;
  model: string;
  tavilyApiKey: string | null;
  braveApiKey: string | null;
  githubToken: string | null;
  forceDemo: boolean;
  allowPrivateFetch: boolean;
  isProduction: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(env.HACKMIND_DATA_DIR || './data');
  const clean = (v?: string) => (v && v.trim() ? v.trim() : null);
  return {
    port: Number(env.PORT) || 8787,
    dataDir,
    dbFile: env.HACKMIND_DB_FILE ? path.resolve(env.HACKMIND_DB_FILE) : path.join(dataDir, 'hackmind.db'),
    anthropicApiKey: clean(env.ANTHROPIC_API_KEY),
    model: clean(env.HACKMIND_MODEL) ?? 'claude-sonnet-5-5',
    tavilyApiKey: clean(env.TAVILY_API_KEY),
    braveApiKey: clean(env.BRAVE_API_KEY),
    githubToken: clean(env.GITHUB_TOKEN),
    forceDemo: env.HACKMIND_FORCE_DEMO === '1',
    allowPrivateFetch: env.HACKMIND_ALLOW_PRIVATE_FETCH === '1',
    isProduction: env.NODE_ENV === 'production',
  };
}
