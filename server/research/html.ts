import * as cheerio from 'cheerio';

export interface ParsedPage {
  title: string;
  description: string;
  text: string;
  links: { text: string; href: string }[];
}

const MAX_TEXT = 40_000;

/** Extract readable text, title, meta description and links from HTML. */
export function parseHtml(html: string, baseUrl?: string): ParsedPage {
  const $ = cheerio.load(html);
  const title = ($('meta[property="og:title"]').attr('content') || $('title').first().text() || '').trim();
  const description = (
    $('meta[name="description"]').attr('content') ||
    $('meta[property="og:description"]').attr('content') ||
    ''
  ).trim();

  const links: ParsedPage['links'] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) return;
    try {
      const abs = baseUrl ? new URL(href, baseUrl).toString() : href;
      if (/^https?:/i.test(abs)) links.push({ text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 120), href: abs });
    } catch {
      /* ignore malformed */
    }
  });

  $('script, style, noscript, svg, iframe, template, nav, footer, form').remove();
  // keep line structure: block-level elements become newlines so headings/lists survive
  $('br').replaceWith('\n');
  $('h1,h2,h3,h4,h5,h6,p,li,tr,div,section,article,dt,dd,blockquote,pre').each((_, el) => {
    $(el).append('\n');
  });
  const raw = $('body').length ? $('body').text() : $.root().text();
  const text = raw
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((l, i, arr) => l.length > 0 || (arr[i - 1] ?? '').length > 0)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_TEXT);

  return { title, description, text, links };
}
