import { assertPublicUrl, UnsafeUrlError } from './ssrf';
import { parseHtml, type ParsedPage } from './html';

export interface FetchedPage extends ParsedPage {
  url: string;
  status: number;
  contentType: string;
}

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 12_000;
const ALLOWED_TYPES = /^(text\/|application\/(xhtml\+xml|json|xml))/i;

export interface FetchOptions {
  allowPrivate?: boolean;
  fetchImpl?: typeof fetch;
}

/**
 * SSRF-hardened page fetch: validates every hop, caps size and time, restricts content types.
 * Returns null for non-fatal failures (404, unsupported type); throws UnsafeUrlError for blocked URLs.
 */
export async function fetchPage(rawUrl: string, opts: FetchOptions = {}): Promise<FetchedPage | null> {
  const f = opts.fetchImpl ?? fetch;
  let url = (await assertPublicUrl(rawUrl, opts.allowPrivate)).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await f(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'user-agent': 'HackmindBot/1.0 (+hackathon research; read-only)',
        accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
      },
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      url = (await assertPublicUrl(new URL(loc, url).toString(), opts.allowPrivate)).toString();
      continue;
    }
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType && !ALLOWED_TYPES.test(contentType)) return null;

    const body = await readCapped(res, MAX_BYTES);
    const parsed = /html|xml/i.test(contentType) || /^\s*</.test(body)
      ? parseHtml(body, url)
      : { title: '', description: '', text: body.slice(0, 40_000), links: [] };
    return { ...parsed, url, status: res.status, contentType };
  }
  throw new UnsafeUrlError('Too many redirects');
}

async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < max) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  try {
    await reader.cancel();
  } catch {
    /* ignore */
  }
  return Buffer.concat(chunks).toString('utf8').slice(0, max);
}
