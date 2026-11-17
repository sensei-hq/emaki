// The SvelteKit glue with real Requests: the hook guards the admin paths (Access token, role, path) and marks what it
// lets through; the route handlers hand the caller and the path to the desk.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDesk, memoryStore, resetAccessCache, type Caller } from '../src/index.js';
import { apiRoutes, mediaRoute, postingHandle } from '../src/sveltekit/index.js';

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
async function token(claims: Record<string, unknown>) {
  const h = enc({ alg: 'RS256', kid: 'k1' }), p = enc({ aud: 'aud1', exp: Math.floor(Date.now() / 1000) + 600, ...claims });
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}
const env = { CF_ACCESS_TEAM_DOMAIN: 'team.cloudflareaccess.com', CF_ACCESS_AUD: 'aud1', ADMIN_EMAILS: 'admin@example.com', STAGER_CLIENT_IDS: 'mac-id.access', POSTER_CLIENT_IDS: 'gh-id.access' };

const O = 'https://site.test';
function event(path: string, o: { method?: string; headers?: Record<string, string>; params?: Record<string, string | undefined>; locals?: Record<string, unknown> } = {}) {
  const url = new URL(path, O);
  return { request: new Request(url, { method: o.method ?? 'GET', headers: o.headers }), url, params: o.params ?? {}, locals: o.locals ?? {} };
}
const page = () => new Response('page body', { headers: { 'content-type': 'text/html' } });

describe('postingHandle', () => {
  beforeEach(() => { resetAccessCache(); vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] })))); });
  afterEach(() => vi.unstubAllGlobals());

  it('passes everything outside the admin paths straight through, untouched', async () => {
    const handle = postingHandle({ env: () => env });
    const resolve = vi.fn(page), e = event('/stories/phishing-101');
    const res = await handle({ event: e, resolve });
    expect(resolve).toHaveBeenCalledWith(e);
    expect(await res.text()).toBe('page body');
    expect(res.headers.get('cache-control')).toBeNull();
    expect(e.locals).toEqual({});
  });

  it('refuses the admin pages and API without Access (JSON for the API, text for pages), unless a dev server', async () => {
    const resolve = vi.fn(page);
    const closed = postingHandle({ env: () => ({}) });
    const api = await closed({ event: event('/api/admin/queue'), resolve });
    expect(api.status).toBe(403);
    expect(api.headers.get('content-type')).toBe('application/json');
    expect(await api.json()).toEqual({ ok: false, reason: 'Not allowed' });
    const pageRes = await closed({ event: event('/admin'), resolve });
    expect(pageRes.status).toBe(403);
    expect(await pageRes.text()).toBe('Not allowed');
    expect(resolve).not.toHaveBeenCalled();

    const dev = postingHandle({ env: () => ({}), dev: true }), e = event('/admin');
    const res = await dev({ event: e, resolve });
    expect(res.status).toBe(200);
    expect(e.locals.caller).toEqual({ role: 'admin', id: 'dev@localhost' });
  });

  it('lets a valid token in as its role, marks the response private, and keeps machines to their endpoints', async () => {
    const handle = postingHandle({ env: () => env }), resolve = vi.fn(page);
    const admin = event('/admin/plan', { headers: { 'cf-access-jwt-assertion': await token({ email: 'admin@example.com' }) } });
    const res = await handle({ event: admin, resolve });
    expect(res.status).toBe(200);
    expect(admin.locals.caller).toEqual({ role: 'admin', id: 'admin@example.com' });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex');

    const stager = await token({ common_name: 'mac-id.access' });
    const stage = event('/api/admin/stage', { method: 'POST', headers: { 'cf-access-jwt-assertion': stager } });
    expect((await handle({ event: stage, resolve })).status).toBe(200);
    expect(stage.locals.caller).toEqual({ role: 'stager', id: 'mac-id.access' });
    const queue = event('/api/admin/queue', { headers: { 'cf-access-jwt-assertion': stager } });
    const refused = await handle({ event: queue, resolve });
    expect(refused.status).toBe(403);
    expect(queue.locals.caller).toBeUndefined();
    expect(resolve).toHaveBeenCalledTimes(2);
  });
});

describe('route handlers', () => {
  const store = memoryStore();
  const desk = createDesk({ store, media: store.media, today: () => '2026-11-20', mediaSecret: 's3cret', pieces: () => [{ slug: 'a', date: '2026-11-20' }], pieceUrl: (s) => `${O}/stories/${s}` });
  const admin: Caller = { role: 'admin', id: 'me@x.com' };

  it('serves the API for a caller the hook let in, at the path after the prefix (async desks too)', async () => {
    const make = vi.fn(async () => desk);
    const { GET, POST, PUT } = apiRoutes(make);
    expect(GET).toBe(POST);
    expect(PUT).toBe(POST);
    const e = event('/api/admin/queue', { params: { path: 'queue' }, locals: { caller: admin } });
    const res = await GET(e);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ paused: true, today: '2026-11-20', items: [] });
    expect(make).toHaveBeenCalledWith(e);
    // No path: the API root, which is nothing.
    expect((await GET(event('/api/admin/', { locals: { caller: admin } }))).status).toBe(404);
  });

  it('refuses a request the hook did not mark, without building the desk', async () => {
    const make = vi.fn(() => desk);
    const res = await apiRoutes(make).POST(event('/api/admin/stage', { method: 'POST', params: { path: 'stage' } }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe('Not allowed');
    expect(make).not.toHaveBeenCalled();
  });

  it('serves signed media links by key, and nothing for no key or no signature', async () => {
    const bytes = new TextEncoder().encode('fake mp4').buffer as ArrayBuffer;
    await store.media.put('a/short.mp4', bytes, { contentType: 'video/mp4', sha256: 'x' });
    const signed = vi.spyOn(desk, 'signedMedia');
    const { GET } = mediaRoute(() => desk);
    const e = event('/m/a/short.mp4?exp=1&sig=00', { params: { key: 'a/short.mp4' } });
    expect((await GET(e)).status).toBe(404);
    expect(signed).toHaveBeenCalledWith('a/short.mp4', e.url);
    expect((await GET(event('/m/'))).status).toBe(404);
    expect(signed).toHaveBeenLastCalledWith('', expect.any(URL));
  });
});
