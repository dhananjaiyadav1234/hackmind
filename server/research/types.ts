export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
  provider: string;
  kind: 'web' | 'paper' | 'repo';
  meta?: Record<string, string | number>;
}

export interface ResearchProviderStatus {
  id: string;
  label: string;
  configured: boolean;
  requiresKey: boolean;
  note: string;
}

/** What the pipeline needs from the outside world. Implementations: LiveResearch, DemoResearch, test fakes. */
export interface Research {
  webSearch(query: string, limit?: number): Promise<SearchHit[]>;
  paperSearch(query: string, limit?: number): Promise<SearchHit[]>;
  repoSearch(query: string, limit?: number): Promise<SearchHit[]>;
  /** Returns null when the page cannot be retrieved. Throws UnsafeUrlError for blocked URLs. */
  fetchPage(url: string): Promise<{ url: string; title: string; description: string; text: string; links: { text: string; href: string }[] } | null>;
  status(): ResearchProviderStatus[];
  /** Non-fatal problems accumulated since last call (provider errors, rate limits). */
  drainWarnings(): string[];
}
