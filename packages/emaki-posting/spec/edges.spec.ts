// The desk's quieter paths: config lists that are not set, values a fingerprint has no key for, signatures of the wrong
// length, ties in the posting order, pieces with no video kind, media stored without a type or checksum, a plan with
// nothing left to post, and the queue as the desk object hands it out.
import { beforeEach, describe, expect, it } from 'vitest';
import { canonical, checkSignature, createDesk, makeNext, memoryStore, sha256, signMedia, type Caller, type MediaStore } from '../src/index.js';
import { resetAccessCache, verifyCaller } from '../src/access.js';

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
const certs = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
async function token(claims: Record<string, unknown>) {
  const h = enc({ alg: 'RS256', kid: 'k1' }), p = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}
const exp = Math.floor(Date.now() / 1000) + 600;

describe('access with lists left unset', () => {
  beforeEach(() => resetAccessCache());
  it('lets no one in when the admin emails and the client-id lists are not configured', async () => {
    const bare = { teamDomain: 'team.cloudflareaccess.com', aud: 'aud1' };
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'admin@example.com' }), bare, certs)).toBeNull();
    expect(await verifyCaller(await token({ aud: 'aud1', exp, common_name: 'mac-id.access' }), bare, certs)).toBeNull();
  });
});

describe('rules at their edges', () => {
  it('fingerprints a missing value as null, wherever it sits', () => {
    expect(canonical(undefined)).toBe('null');
    expect(canonical({ b: undefined, a: [undefined, 1] })).toBe('{"a":[null,1],"b":null}');
  });

  it('refuses a signature of the wrong length without comparing it', async () => {
    const now = Date.UTC(2026, 10, 20);
    const url = new URL(await signMedia('a/short.mp4', 's', 'https://x.test', 3600, now));
    const exp = url.searchParams.get('exp')!, sig = url.searchParams.get('sig')!;
    expect(await checkSignature('a/short.mp4', exp, sig, 's', now)).toBe(true);
    expect(await checkSignature('a/short.mp4', exp, sig.slice(1), 's', now)).toBe(false);
  });

  it('breaks a tie between pieces on the same date by slug', () => {
    const dates = new Map([['b', '2026-12-01'], ['a', '2026-12-01'], ['c', '2026-12-05']]);
    expect([...makeNext(dates, 'c', '2026-11-20')]).toEqual([['c', '2026-12-01'], ['b', '2026-12-05']]);
  });
});

const admin: Caller = { role: 'admin', id: 'me@x.com' }, stager: Caller = { role: 'stager', id: 'mac' }, poster: Caller = { role: 'poster', id: 'ci' };
const O = 'https://site.test';

describe('the desk at its edges', () => {
  it('serves the queue from the desk object, and calls a piece with no video kind a short', async () => {
    const store = memoryStore();
    const desk = createDesk({ store, media: store.media, today: () => '2026-11-20', pieces: () => [{ slug: 'a', date: '2026-11-20' }], pieceUrl: (s) => `${O}/${s}` });
    const call = (c: Caller, method: string, sub: string, body?: unknown) => desk.api(new Request(`${O}/api/admin/${sub}`, { method, body: body ? JSON.stringify(body) : undefined }), c, sub);
    const { content_sha } = await (await call(stager, 'POST', 'stage', { slug: 'a', channel: 'x', post: { text: 't', media: [] } })).json();
    await desk.desk.approve(admin.id, 'a', [`x:${content_sha}`]);
    await desk.desk.resume(admin.id);
    const q = await desk.queue(O);
    expect(q).toMatchObject({ paused: false, today: '2026-11-20' });
    expect(q.items.map((i) => [i.slug, i.channel, i.video, i.article])).toEqual([['a', 'x', 'short', `${O}/a`]]);
    await call(poster, 'POST', 'posted', { slug: 'a', channel: 'x', content_sha, status: 'posted' });
    expect((await desk.queue(O)).items).toEqual([]);
  });

  it('serves media stored without a type or checksum as octet-stream with an empty checksum header', async () => {
    const store = memoryStore();
    const media: MediaStore = { ...store.media, get: async () => ({ body: new TextEncoder().encode('raw').buffer as ArrayBuffer, size: 3 }) };
    const desk = createDesk({ store, media, today: () => '2026-11-20', pieces: () => [], pieceUrl: (s) => s });
    const r = await desk.api(new Request(`${O}/api/admin/media/a/raw.bin`), poster, 'media/a/raw.bin');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/octet-stream');
    expect(r.headers.get('x-content-sha256')).toBe('');
    expect(await r.text()).toBe('raw');
  });

  it('stores an upload whose key has no extension as octet-stream', async () => {
    const store = memoryStore();
    const desk = createDesk({ store, media: store.media, today: () => '2026-11-20', pieces: () => [], pieceUrl: (s) => s });
    const b = new TextEncoder().encode('x').buffer as ArrayBuffer;
    const r = await desk.api(new Request(`${O}/api/admin/media/a/noext`, { method: 'PUT', body: b, headers: { 'x-content-sha256': await sha256(b) } }), stager, 'media/a/noext');
    expect(r.status).toBe(200);
    expect((await store.media.get('a/noext'))!.contentType).toBe('application/octet-stream');
  });

  it('orders pieces on the same date by slug, and has no next piece once everything is in the past', async () => {
    const store = memoryStore();
    const desk = createDesk({
      store, media: store.media, today: () => '2026-12-31', pieceUrl: (s) => s,
      pieces: () => [{ slug: 'b', date: '2026-11-20' }, { slug: 'a', date: '2026-11-20' }],
    });
    const p = await desk.desk.plan();
    expect(p.plan.map((r) => r.slug)).toEqual(['a', 'b']);
    expect(p.next).toBeNull();
  });
});
