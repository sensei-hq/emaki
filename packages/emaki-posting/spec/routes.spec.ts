// Every route of the desk API and every desk action, status code and error body included, so the router can change
// shape without changing what a machine or a person sees.
import { describe, expect, it } from 'vitest';
import { createDesk, memoryStore, sha256, type Caller } from '../src/index.js';

const stager: Caller = { role: 'stager', id: 'mac' }, poster: Caller = { role: 'poster', id: 'ci' }, admin: Caller = { role: 'admin', id: 'me@x.com' };
const O = 'https://site.test';
function setup(o: { today?: string; mediaSecret?: string; mediaOrigin?: string; mediaPath?: string } = {}) {
  const store = memoryStore();
  const desk = createDesk({
    store, media: store.media, today: () => o.today ?? '2026-11-20', mediaSecret: o.mediaSecret, mediaOrigin: o.mediaOrigin, mediaPath: o.mediaPath,
    pieces: () => [{ slug: 'phishing-101', date: '2026-11-20', video: 'short' }, { slug: 'later-one', date: '2026-12-01', video: 'wide' }],
    pieceUrl: (s) => `${O}/stories/${s}`,
  });
  const call = (c: Caller, method: string, sub: string, body?: unknown, headers: Record<string, string> = {}) =>
    desk.api(new Request(`${O}/api/admin/${sub}`, { method, body: body instanceof ArrayBuffer || typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined, headers }), c, sub);
  return { store, desk, call };
}
const bytes = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;
async function upload(call: ReturnType<typeof setup>['call'], key: string, content = 'fake mp4') {
  const b = bytes(content), sum = await sha256(b);
  await call(stager, 'PUT', `media/${key}`, b, { 'x-content-sha256': sum });
  return sum;
}

describe('desk api routes', () => {
  it('answers unknown paths and unknown methods with a JSON 404', async () => {
    const { call } = setup();
    for (const [m, sub] of [['GET', 'nope'], ['POST', 'queue'], ['GET', 'posted'], ['GET', 'stage'], ['GET', 'production'], ['POST', 'schedule'], ['PUT', 'requests'], ['DELETE', 'media/a/b.mp4'], ['POST', 'media/a/b.mp4'], ['GET', 'media']]) {
      const r = await call(admin, m, sub);
      expect(r.status, `${m} ${sub}`).toBe(404);
      expect(r.headers.get('content-type')).toBe('application/json');
      expect(await r.json()).toEqual({ ok: false, reason: 'Not found' });
    }
  });

  it('lets a body that is not JSON throw, rather than answering for it', async () => {
    const { call } = setup();
    await expect(call(stager, 'POST', 'stage', '{not json')).rejects.toThrow();
  });

  it('PUT media: checks the key, the size and the sha256, then stores the file with its type and audits it', async () => {
    const { call, store } = setup();
    const b = bytes('fake mp4'), sum = await sha256(b);
    let r = await call(stager, 'PUT', 'media/Bad/Key.mp4', b, { 'x-content-sha256': sum });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, reason: 'Bad key: <slug>/<file>, lower-case' });
    r = await call(stager, 'PUT', 'media/a/short.mp4', b);
    expect(await r.json()).toEqual({ ok: false, reason: `sha256 mismatch (got ${sum})` });
    r = await call(stager, 'PUT', 'media/a/short.mp4', b, { 'x-content-sha256': sum.toUpperCase() });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, key: 'a/short.mp4', sha256: sum, bytes: b.byteLength });
    expect((await store.media.get('a/short.mp4'))!.contentType).toBe('video/mp4');
    await call(stager, 'PUT', 'media/a/cover.webp', b, { 'x-content-sha256': sum });
    expect((await store.media.get('a/cover.webp'))!.contentType).toBe('image/webp');
    await call(stager, 'PUT', 'media/a/data.bin', b, { 'x-content-sha256': sum });
    expect((await store.media.get('a/data.bin'))!.contentType).toBe('application/octet-stream');
    expect((await store.recentAudit()).at(-1)).toMatchObject({ actor: 'mac', action: 'upload', slug: 'a', channel: null, detail: `a/short.mp4 ${sum.slice(0, 12)}` });
  });

  it('PUT media: refuses a body over the limit with 413', async () => {
    const { call } = setup();
    const r = await call(stager, 'PUT', 'media/a/big.mp4', new ArrayBuffer(95 * 1024 * 1024 + 1), { 'x-content-sha256': 'x' });
    expect(r.status).toBe(413);
    expect(await r.json()).toEqual({ ok: false, reason: 'Too large' });
  });

  it('GET media: serves a stored file with its headers, 400 for a bad key, 404 for a missing one', async () => {
    const { call } = setup();
    const sum = await upload(call, 'a/short.mp4');
    let r = await call(poster, 'GET', 'media/a/short.mp4');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('video/mp4');
    expect(r.headers.get('content-length')).toBe('8');
    expect(r.headers.get('x-content-sha256')).toBe(sum);
    expect(await r.text()).toBe('fake mp4');
    r = await call(poster, 'GET', 'media/../x');
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, reason: 'Bad key' });
    r = await call(poster, 'GET', 'media/a/missing.mp4');
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ ok: false, reason: 'Not found' });
  });

  it('POST stage: needs a known piece, a channel and media that is uploaded under the piece with the same sha256', async () => {
    const { call } = setup();
    const sum = await upload(call, 'phishing-101/short.mp4');
    const media = [{ key: 'phishing-101/short.mp4', sha256: sum, type: 'video' }];
    const reason = async (body: unknown) => { const r = await call(stager, 'POST', 'stage', body); return [r.status, (await r.json()).reason]; };
    expect(await reason({ slug: 'nope', channel: 'youtube', post: { media } })).toEqual([400, 'No piece "nope" in the index']);
    expect(await reason({ slug: 'phishing-101', channel: 'tiktok', post: { media } })).toEqual([400, 'channel and post.media are required']);
    expect(await reason({ slug: 'phishing-101', channel: 'youtube' })).toEqual([400, 'channel and post.media are required']);
    expect(await reason({ slug: 'phishing-101', channel: 'youtube', post: { media: 'x' } })).toEqual([400, 'channel and post.media are required']);
    expect(await reason({ slug: 'phishing-101', channel: 'youtube', post: { media: [{ ...media[0], key: 'later-one/short.mp4' }] } })).toEqual([400, 'Bad media key later-one/short.mp4']);
    expect(await reason({ slug: 'phishing-101', channel: 'youtube', post: { media: [{ ...media[0], key: 'phishing-101/BAD' }] } })).toEqual([400, 'Bad media key phishing-101/BAD']);
    expect(await reason({ slug: 'phishing-101', channel: 'youtube', post: { media: [{ ...media[0], sha256: 'f'.repeat(64) }] } })).toEqual([400, 'phishing-101/short.mp4 is not uploaded with that sha256']);
    expect(await reason({ slug: 'phishing-101', channel: 'youtube', post: { media: [{ ...media[0], key: 'phishing-101/none.mp4' }] } })).toEqual([400, 'phishing-101/none.mp4 is not uploaded with that sha256']);
    const ok = await (await call(stager, 'POST', 'stage', { slug: 'phishing-101', channel: 'youtube', post: { media } })).json();
    expect(Object.keys(ok)).toEqual(['ok', 'content_sha']);
    expect(ok.ok).toBe(true);
  });

  it('POST posted: needs slug, channel, content_sha and a known status; trims the detail', async () => {
    const { call, store } = setup();
    const base = { slug: 'phishing-101', channel: 'x', content_sha: 'abc', status: 'failed' };
    for (const bad of [{ ...base, slug: '' }, { ...base, channel: 'tiktok' }, { ...base, content_sha: '' }, { ...base, status: 'maybe' }]) {
      const r = await call(poster, 'POST', 'posted', bad);
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ ok: false, reason: 'slug, channel, content_sha and status are required' });
    }
    const r = await call(poster, 'POST', 'posted', { ...base, detail: 'd'.repeat(3000), run: 'r1', external_id: 'e1' });
    expect(await r.json()).toEqual({ ok: true });
    const row = (await store.readAll()).posts[0];
    expect(row).toMatchObject({ slug: 'phishing-101', channel: 'x', content_sha: 'abc', status: 'failed', url: null, external_id: 'e1', run: 'r1' });
    expect(row.detail).toHaveLength(2000);
  });

  it('POST production: saves known pieces only, trims the script, and counts what it saved', async () => {
    const { call, store } = setup();
    const r = await call(stager, 'POST', 'production', { items: [
      { slug: 'phishing-101', script: 's'.repeat(70000), status: { film: true } }, { slug: 'unknown', status: {} }, { slug: 'later-one' },
    ] });
    expect(await r.json()).toEqual({ ok: true, saved: 2 });
    const rows = await store.readProduction();
    expect(rows.find((x) => x.slug === 'phishing-101')).toMatchObject({ status: { film: true } });
    expect(rows.find((x) => x.slug === 'phishing-101')!.script).toHaveLength(60000);
    expect(rows.find((x) => x.slug === 'later-one')).toMatchObject({ script: null, status: {} });
    expect(await (await call(stager, 'POST', 'production', {})).json()).toEqual({ ok: true, saved: 0 });
  });

  it('GET/POST requests: lists open threads, answers them, 404 for a reply to an unknown request', async () => {
    const { desk, call, store } = setup();
    await desk.desk.request(admin.id, 'phishing-101', 'edit', 'Slower');
    const [open] = (await (await call(stager, 'GET', 'requests')).json()).requests;
    expect(open).toMatchObject({ slug: 'phishing-101', kind: 'edit', body: 'Slower', status: 'open', parent: null, thread: [] });
    let r = await call(stager, 'POST', 'requests', { id: 999, reply: 'x' });
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ ok: false, reason: 'No such request' });
    r = await call(stager, 'POST', 'requests', { id: String(open.id), reply: 'On it', status: 'bogus' });
    expect(await r.json()).toEqual({ ok: true });
    const [again] = (await (await call(stager, 'GET', 'requests')).json()).requests;
    expect(again.status).toBe('open');
    expect(again.thread.map((t: { body: string; author: string }) => [t.body, t.author])).toEqual([['On it', 'mac']]);
    await call(stager, 'POST', 'requests', { id: open.id, status: 'working' });
    expect((await store.readRequests()).find((x) => x.id === open.id)!.status).toBe('working');
  });

  it('GET queue: links media through the configured origin and path, or not at all without a secret', async () => {
    for (const [o, link] of [
      [{ mediaSecret: 's' }, /^https:\/\/site\.test\/m\/phishing-101\/short\.mp4\?/],
      [{ mediaSecret: 's', mediaOrigin: 'https://cdn.test', mediaPath: '/media' }, /^https:\/\/cdn\.test\/media\/phishing-101\/short\.mp4\?/],
      [{}, null],
    ] as const) {
      const { desk, call } = setup(o);
      const sum = await upload(call, 'phishing-101/short.mp4');
      const { content_sha } = await (await call(stager, 'POST', 'stage', { slug: 'phishing-101', channel: 'youtube', post: { media: [{ key: 'phishing-101/short.mp4', sha256: sum, type: 'video' }] } })).json();
      await desk.desk.approve(admin.id, 'phishing-101', [`youtube:${content_sha}`]);
      await desk.desk.resume(admin.id);
      const q = await (await call(poster, 'GET', 'queue')).json();
      expect(q).toMatchObject({ paused: false, today: '2026-11-20' });
      expect(q.items[0]).toMatchObject({ slug: 'phishing-101', channel: 'youtube', content_sha, article: `${O}/stories/phishing-101`, video: 'short' });
      if (link) expect(q.items[0].media[0].url).toMatch(link);
      else expect(q.items[0].media[0].url).toBeNull();
    }
  });

  it('signed media: 404 without a secret, for a bad key, a missing file or a bad signature; private headers on success', async () => {
    const plain = setup();
    expect((await plain.desk.signedMedia('a/short.mp4', new URL(`${O}/m/a/short.mp4`))).status).toBe(404);
    const { desk, call } = setup({ mediaSecret: 's' });
    const sum = await upload(call, 'phishing-101/short.mp4');
    const { content_sha } = await (await call(stager, 'POST', 'stage', { slug: 'phishing-101', channel: 'youtube', post: { media: [{ key: 'phishing-101/short.mp4', sha256: sum, type: 'video' }] } })).json();
    await desk.desk.approve(admin.id, 'phishing-101', [`youtube:${content_sha}`]);
    await desk.desk.resume(admin.id);
    const link = new URL((await (await call(poster, 'GET', 'queue')).json()).items[0].media[0].url);
    const r = await desk.signedMedia('phishing-101/short.mp4', link);
    expect(r.status).toBe(200);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    expect(r.headers.get('x-robots-tag')).toBe('noindex');
    expect(r.headers.get('content-length')).toBe('8');
    expect((await desk.signedMedia('BAD', link)).status).toBe(404);
    expect((await desk.signedMedia('phishing-101/other.mp4', link)).status).toBe(404);
    const noSig = new URL(link); noSig.search = '';
    const res = await desk.signedMedia('phishing-101/short.mp4', noSig);
    expect([res.status, await res.text()]).toEqual([404, 'Not found']);
  });
});

describe('desk actions', () => {
  it('approve: counts what matched and 409s when some changed', async () => {
    const { desk, call } = setup();
    const { content_sha } = await (await call(stager, 'POST', 'stage', { slug: 'phishing-101', channel: 'x', post: { text: 't', media: [] } })).json();
    expect(await desk.desk.approve(admin.id, 'phishing-101', [`x:${content_sha}`])).toEqual({ ok: 'Approved 1' });
    expect(await desk.desk.approve(admin.id, 'phishing-101', [`x:${content_sha}`, 'x:old', 'tiktok:1'])).toEqual({ status: 409, error: 'Approved 1 of 3: the rest changed since this page loaded. Reload and check again.' });
  });

  it('revoke: refuses a bad channel, else withdraws', async () => {
    const { desk, store } = setup();
    expect(await desk.desk.revoke(admin.id, 'phishing-101', 'tiktok')).toEqual({ status: 400, error: 'Bad channel' });
    expect(await desk.desk.revoke(admin.id, 'phishing-101', 'x')).toEqual({ ok: 'Approval withdrawn' });
    expect((await store.recentAudit())[0]).toMatchObject({ action: 'revoke', slug: 'phishing-101', channel: 'x' });
  });

  it('makeNext: refuses a piece that is already next', async () => {
    const { desk } = setup({ today: '2026-11-10' });
    expect(await desk.desk.makeNext(admin.id, 'phishing-101')).toEqual({ status: 400, error: 'That piece is already next, or already published.' });
    expect(await desk.desk.makeNext(admin.id, 'later-one')).toEqual({ ok: 'Moved later-one to 2026-11-20; 1 other piece(s) moved down one slot.' });
  });

  it('request: needs a known piece and a body unless generating; unknown kinds become edits', async () => {
    const { desk, store } = setup();
    expect(await desk.desk.request(admin.id, 'nope', 'edit', 'x')).toEqual({ status: 400, error: 'No such piece' });
    expect(await desk.desk.request(admin.id, 'phishing-101', 'edit', '  ')).toEqual({ status: 400, error: 'Say what to change' });
    expect(await desk.desk.request(admin.id, 'phishing-101', 'generate', ' ')).toEqual({ ok: 'Sent. Replies appear in the thread.' });
    expect(await desk.desk.request(admin.id, 'phishing-101', 'weird', ' Faster ')).toEqual({ ok: 'Sent. Replies appear in the thread.' });
    expect((await store.readRequests()).map((r) => [r.kind, r.body])).toEqual([['generate', 'Generate the motion for this piece from its script.'], ['edit', 'Faster']]);
  });

  it('reply: 404 for an unknown request; adds a trimmed note and sets the status when given', async () => {
    const { desk, store } = setup();
    expect(await desk.desk.reply(admin.id, 1, 'x')).toEqual({ status: 404, error: 'No such request' });
    await desk.desk.request(admin.id, 'phishing-101', 'note', 'Hi');
    const [r] = await store.readRequests();
    expect(await desk.desk.reply(admin.id, r.id, '  ', 'done')).toEqual({ ok: 'Saved' });
    expect(await desk.desk.reply(admin.id, r.id, ' Thanks ')).toEqual({ ok: 'Saved' });
    const all = await store.readRequests();
    expect(all.find((x) => x.id === r.id)!.status).toBe('done');
    expect(all.filter((x) => x.parent === r.id).map((x) => x.body)).toEqual(['Thanks']);
  });

  it('pause and resume', async () => {
    const { desk, store } = setup();
    expect(await desk.desk.resume(admin.id)).toEqual({ ok: 'Posting resumed' });
    expect((await store.readAll()).paused).toBe(false);
    expect(await desk.desk.pause(admin.id)).toEqual({ ok: 'Posting paused' });
    expect((await store.readAll()).paused).toBe(true);
  });

  it('plan: every piece in date order with the expected channels, states, production and requests', async () => {
    const { desk, call, store } = setup({ today: '2026-11-25' });
    const { content_sha } = await (await call(stager, 'POST', 'stage', { slug: 'phishing-101', channel: 'x', post: { text: 't', media: [] } })).json();
    await desk.desk.approve(admin.id, 'phishing-101', [`x:${content_sha}`]);
    await call(poster, 'POST', 'posted', { slug: 'phishing-101', channel: 'x', content_sha, status: 'posted', url: 'https://x.com/1' });
    await store.saveProduction('phishing-101', 'script', { film: true });
    await desk.desk.request(admin.id, 'later-one', 'edit', 'Change');
    const p = await desk.desk.plan();
    expect(p).toMatchObject({ today: '2026-11-25', paused: true });
    expect(p.plan.map((r) => [r.slug, r.date, r.built, r.moved, r.live])).toEqual([['phishing-101', '2026-11-20', '2026-11-20', false, true], ['later-one', '2026-12-01', '2026-12-01', false, false]]);
    expect(p.plan[0].channels.map((c) => [c.channel, c.state, c.url])).toEqual([['youtube', 'not-staged', null], ['instagram_reel', 'not-staged', null], ['instagram_carousel', 'not-staged', null], ['x', 'posted', 'https://x.com/1']]);
    expect(p.plan[1].channels.map((c) => c.channel)).toEqual(['youtube', 'instagram_reel', 'x']);
    expect(p.plan[0]).toMatchObject({ script: 'script', status: { film: true } });
    expect(p.plan[1]).toMatchObject({ script: null, status: {}, reported: null });
    expect(p.plan[1].requests.map((r) => r.body)).toEqual(['Change']);
    expect(p.next!.slug).toBe('later-one');
    expect(p.audit.length).toBeGreaterThan(0);
  });

  it('channelsFor overrides the expected channels', async () => {
    const store = memoryStore();
    const desk = createDesk({ store, media: store.media, today: () => '2026-11-20', pieces: () => [{ slug: 'a', date: '2026-11-20' }], pieceUrl: (s) => s, channelsFor: () => ['x'] });
    expect((await desk.desk.plan()).plan[0].channels.map((c) => c.channel)).toEqual(['x']);
  });
});
