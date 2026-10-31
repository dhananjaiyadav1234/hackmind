import { describe, expect, it, vi } from 'vitest';
import { assertPublicUrl, isPrivateIp, UnsafeUrlError } from '../server/research/ssrf';
import { fetchPage } from '../server/research/fetcher';
import { extractJson } from '../server/llm';
import { parseHtml } from '../server/research/html';
import { startTestServer } from './helpers';

describe('SSRF guard', () => {
  it.each(['127.0.0.1', '10.1.2.3', '192.168.0.5', '172.16.0.1', '169.254.169.254', '::1', 'fd00::1', '::ffff:127.0.0.1', '0.0.0.0'])('flags %s as private', (ip) => {
    expect(isPrivateIp(ip)).toBe(true);
  });
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])('allows public %s', (ip) => expect(isPrivateIp(ip)).toBe(false));
  it.each(['http://localhost/x', 'http://127.0.0.1:8787/api', 'http://169.254.169.254/latest/meta-data', 'file:///etc/passwd', 'ftp://example.com', 'http://user:pw@example.com', 'http://[::1]/', 'http://service.internal/', 'not a url'])('rejects %s', async (u) => {
    await expect(assertPublicUrl(u)).rejects.toBeInstanceOf(UnsafeUrlError);
  });
  it('re-validates every redirect hop', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://169.254.169.254/latest/meta-data' } }));
    await expect(fetchPage('http://8.8.8.8/start', { fetchImpl: fetchImpl as unknown as typeof fetch })).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('rejects non-text content types', async () => {
    const fetchImpl = async () => new Response('%PDF', { status: 200, headers: { 'content-type': 'application/pdf' } });
    expect(await fetchPage('http://8.8.8.8/a.pdf', { fetchImpl: fetchImpl as unknown as typeof fetch })).toBeNull();
  });
});

describe('HTML parsing', () => {
  it('drops scripts and keeps headings as separate lines', () => {
    const p = parseHtml('<html><head><title>T</title></head><body><script>alert(1)</script><h2>Judging Criteria</h2><ul><li>Impact (30%)</li><li>Demo (20%)</li></ul></body></html>');
    expect(p.text).not.toContain('alert');
    expect(p.text.split('\n')).toEqual(['Judging Criteria', 'Impact (30%)', 'Demo (20%)']);
  });
});

describe('extractJson', () => {
  it('handles fences, chatter and nested braces in strings', () => {
    expect(extractJson('Sure!\n```json\n{"a":"}{","b":[1,2]}\n```')).toEqual({ a: '}{', b: [1, 2] });
    expect(extractJson('prefix [1,{"x":2}] suffix')).toEqual([1, { x: 2 }]);
    expect(() => extractJson('no json here')).toThrow();
  });
});

describe('API hardening', () => {
  it('rejects private URLs at workspace creation', async () => {
    const s = await startTestServer();
    try {
      for (const url of ['http://localhost:8787', 'http://169.254.169.254/', 'file:///etc/passwd', 'demo://resilient-cities-build-sprint-2026']) {
        const r = await s.call('POST', '/workspaces', { url });
        expect(r.status, url).toBe(400);
      }
    } finally { await s.close(); }
  });
  it('validates ids and bodies, and sets security headers', async () => {
    const s = await startTestServer();
    try {
      expect((await s.call('GET', '/workspaces/not-an-id')).status).toBe(400);
      expect((await s.call('GET', '/workspaces/ws_000000000000')).status).toBe(404);
      expect((await s.call('POST', '/workspaces', {})).status).toBe(400);
      expect((await s.call('POST', '/workspaces', { manualText: 'x', config: { initialIdeas: 9999 } })).status).toBe(400);
      const res = await fetch(`${s.base}/status`);
      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-powered-by')).toBeNull();
      const bad = await fetch(`${s.base}/workspaces`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
      expect(bad.status).toBe(400);
    } finally { await s.close(); }
  });
  it('blocks SSRF through the add-source endpoint', async () => {
    const s = await startTestServer({ research: { ...(await import('./helpers')).OfflineResearch.prototype, status: () => [], drainWarnings: () => [], webSearch: async () => [], paperSearch: async () => [], repoSearch: async () => [], fetchPage: async (u: string) => { await assertPublicUrl(u); return null; } } });
    try {
      const ws = (await s.call('POST', '/workspaces', { manualText: 'A hackathon' })).body.workspace.id;
      const r = await s.call('POST', `/workspaces/${ws}/sources`, { url: 'http://127.0.0.1:9/' });
      expect(r.status).toBe(400);
    } finally { await s.close(); }
  });
});

describe('prototype-key hardening', () => {
  it('rejects inherited property names as intel fields', async () => {
    const s = await startTestServer();
    try {
      const ws = (await s.call('POST', '/workspaces', { manualText: 'A hackathon' })).body.workspace.id;
      for (const f of ['constructor', '__proto__', 'toString']) expect((await s.call('PUT', `/workspaces/${ws}/intel/${f}`, { value: 'x' })).status, f).toBe(400);
    } finally { await s.close(); }
  });
});
