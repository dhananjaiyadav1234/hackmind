import * as cheerio from 'cheerio';
import type { AppConfig } from '../config';
import { fetchPage } from './fetcher';
import type { Research, ResearchProviderStatus, SearchHit } from './types';

type FetchLike = typeof fetch;

const UA = 'HackmindBot/1.0 (+hackathon research; read-only)';

async function getJson(f: FetchLike, url: string, init: RequestInit = {}): Promise<unknown> {
  const res = await f(url, { ...init, signal: AbortSignal.timeout(12_000) });
  if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
  return res.json();
}

export class LiveResearch implements Research {
  private warnings: string[] = [];

  constructor(
    private cfg: Pick<AppConfig, 'tavilyApiKey' | 'braveApiKey' | 'githubToken' | 'allowPrivateFetch'>,
    private f: FetchLike = fetch,
  ) {}

  private warn(msg: string) {
    if (!this.warnings.includes(msg)) this.warnings.push(msg);
  }
  drainWarnings(): string[] {
    const w = this.warnings;
    this.warnings = [];
    return w;
  }

  status(): ResearchProviderStatus[] {
    return [
      { id: 'fetch', label: 'Direct page fetch', configured: true, requiresKey: false, note: 'SSRF-guarded fetch of hackathon / sponsor / docs pages.' },
      { id: 'tavily', label: 'Tavily search', configured: !!this.cfg.tavilyApiKey, requiresKey: true, note: 'Set TAVILY_API_KEY for high-quality web search.' },
      { id: 'brave', label: 'Brave Search', configured: !!this.cfg.braveApiKey, requiresKey: true, note: 'Set BRAVE_API_KEY as an alternative web search provider.' },
      { id: 'duckduckgo', label: 'DuckDuckGo HTML (keyless fallback)', configured: true, requiresKey: false, note: 'Best-effort scraping; may be rate-limited or blocked.' },
      { id: 'arxiv', label: 'arXiv papers', configured: true, requiresKey: false, note: 'Public API, no key.' },
      { id: 'github', label: 'GitHub repositories', configured: true, requiresKey: false, note: this.cfg.githubToken ? 'Authenticated (higher rate limit).' : 'Unauthenticated (10 searches/min). Set GITHUB_TOKEN to raise.' },
    ];
  }

  async webSearch(query: string, limit = 6): Promise<SearchHit[]> {
    const attempts: [string, () => Promise<SearchHit[]>][] = [];
    if (this.cfg.tavilyApiKey) attempts.push(['tavily', () => this.tavily(query, limit)]);
    if (this.cfg.braveApiKey) attempts.push(['brave', () => this.brave(query, limit)]);
    attempts.push(['duckduckgo', () => this.ddg(query, limit)]);
    for (const [id, run] of attempts) {
      try {
        const hits = await run();
        if (hits.length) return hits;
      } catch (e) {
        this.warn(`Search provider ${id} failed: ${(e as Error).message}`);
      }
    }
    return [];
  }

  private async tavily(query: string, limit: number): Promise<SearchHit[]> {
    const data = (await getJson(this.f, 'https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.cfg.tavilyApiKey}` },
      body: JSON.stringify({ query, max_results: limit, search_depth: 'basic' }),
    })) as { results?: { title?: string; url?: string; content?: string }[] };
    return (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({ title: r.title ?? r.url!, url: r.url!, snippet: (r.content ?? '').slice(0, 400), provider: 'tavily', kind: 'web' as const }));
  }

  private async brave(query: string, limit: number): Promise<SearchHit[]> {
    const data = (await getJson(this.f, `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`, {
      headers: { accept: 'application/json', 'x-subscription-token': this.cfg.braveApiKey! },
    })) as { web?: { results?: { title?: string; url?: string; description?: string }[] } };
    return (data.web?.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({ title: r.title ?? r.url!, url: r.url!, snippet: stripTags(r.description ?? '').slice(0, 400), provider: 'brave', kind: 'web' as const }));
  }

  private async ddg(query: string, limit: number): Promise<SearchHit[]> {
    const res = await this.f(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      headers: { 'user-agent': UA, accept: 'text/html' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) throw new Error(`duckduckgo responded ${res.status}`);
    const $ = cheerio.load(await res.text());
    const hits: SearchHit[] = [];
    $('.result').each((_, el) => {
      if (hits.length >= limit) return;
      const a = $(el).find('a.result__a').first();
      let href = a.attr('href') ?? '';
      const m = href.match(/[?&]uddg=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]);
      if (href.startsWith('//')) href = `https:${href}`;
      if (!/^https?:\/\//i.test(href)) return;
      hits.push({ title: a.text().trim(), url: href, snippet: $(el).find('.result__snippet').text().trim().slice(0, 400), provider: 'duckduckgo', kind: 'web' });
    });
    return hits;
  }

  async paperSearch(query: string, limit = 4): Promise<SearchHit[]> {
    try {
      const q = query.replace(/[^\w\s-]/g, ' ').split(/\s+/).filter(Boolean).slice(0, 8).join('+AND+');
      const res = await this.f(`https://export.arxiv.org/api/query?search_query=all:${q}&max_results=${limit}&sortBy=relevance`, {
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`arxiv responded ${res.status}`);
      const $ = cheerio.load(await res.text(), { xmlMode: true });
      const hits: SearchHit[] = [];
      $('entry').each((_, el) => {
        const id = $(el).find('id').first().text().trim();
        const title = $(el).find('title').first().text().replace(/\s+/g, ' ').trim();
        if (!id || !title) return;
        const authors = $(el).find('author name').map((__, n) => $(n).text().trim()).get().slice(0, 4).join(', ');
        const published = $(el).find('published').first().text().slice(0, 4);
        hits.push({
          title, url: id, kind: 'paper', provider: 'arxiv',
          snippet: $(el).find('summary').first().text().replace(/\s+/g, ' ').trim().slice(0, 500),
          meta: { authors, year: published },
        });
      });
      return hits;
    } catch (e) {
      this.warn(`arXiv search failed: ${(e as Error).message}`);
      return [];
    }
  }

  async repoSearch(query: string, limit = 5): Promise<SearchHit[]> {
    try {
      const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': UA };
      if (this.cfg.githubToken) headers.authorization = `Bearer ${this.cfg.githubToken}`;
      const data = (await getJson(this.f, `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`, { headers })) as {
        items?: { full_name: string; html_url: string; description: string | null; stargazers_count: number; language: string | null; pushed_at: string }[];
      };
      return (data.items ?? []).map((r) => ({
        title: r.full_name, url: r.html_url, kind: 'repo' as const, provider: 'github',
        snippet: r.description ?? '',
        meta: { stars: r.stargazers_count, language: r.language ?? '', pushed: r.pushed_at?.slice(0, 10) ?? '' },
      }));
    } catch (e) {
      this.warn(`GitHub search failed: ${(e as Error).message}`);
      return [];
    }
  }

  async fetchPage(url: string) {
    const page = await fetchPage(url, { allowPrivate: this.cfg.allowPrivateFetch, fetchImpl: this.f });
    return page ? { url: page.url, title: page.title, description: page.description, text: page.text, links: page.links } : null;
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'");
}
