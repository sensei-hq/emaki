// The desk end to end over the in-memory store: upload, stage, approve, queue, post, plus the role and signature
// checks a machine meets on the way.
import { describe, expect, it } from 'vitest';
import { allowed, createDesk, memoryStore, sha256, type Caller } from '../src/index.js';

const stager: Caller = { role: 'stager', id: 'mac' }, poster: Caller = { role: 'poster', id: 'ci' }, admin: Caller = { role: 'admin', id: 'me@x.com' };
const O = 'https://site.test';
function setup(today = '2026-11-20') {
  const store = memoryStore();
  const desk = createDesk({
    store, media: store.media, today: () => today, mediaSecret: 's3cret',
    pieces: () => [{ slug: 'phishing-101', date: '2026-11-20', video: 'short' }, { slug: 'later-one', date: '2026-12-01' }],
    pieceUrl: (s) => `${O}/stories/${s}`,
  });
  const call = (c: Caller, method: string, sub: string, body?: unknown, headers: Record<string, string> = {}) =>
    desk.api(new Request(`${O}/api/admin/${sub}`, { method, body: body instanceof ArrayBuffer ? body : body ? JSON.stringify(body) : undefined, headers }), c, sub);
  return { store, desk, call };
}

describe('posting desk', () => {
  it('posts only what was approved, once its date has come and posting is resumed', async () => {
    const { desk, call } = setup();
    const bytes = new TextEncoder().encode('fake mp4').buffer as ArrayBuffer, sum = await sha256(bytes);
    expect((await call(stager, 'PUT', 'media/phishing-101/short.mp4', bytes, { 'x-content-sha256': 'nope' })).status).toBe(400);
    expect((await call(stager, 'PUT', 'media/phishing-101/short.mp4', bytes, { 'x-content-sha256': sum })).status).toBe(200);
    const post = { title: 'Spot the phish', media: [{ key: 'phishing-101/short.mp4', sha256: sum, type: 'video' }] };
    expect((await call(stager, 'POST', 'stage', { slug: 'nope', channel: 'youtube', post })).status).toBe(400);
    const staged = await (await call(stager, 'POST', 'stage', { slug: 'phishing-101', channel: 'youtube', post })).json();
    expect(staged.content_sha).toMatch(/^[0-9a-f]{64}$/);

    // Approved but paused: nothing goes out.
    expect((await desk.desk.approve(admin.id, 'phishing-101', [`youtube:${staged.content_sha}`])).ok).toBeTruthy();
    expect((await (await call(poster, 'GET', 'queue')).json()).items).toEqual([]);
    await desk.desk.resume(admin.id);
    const q = await (await call(poster, 'GET', 'queue')).json();
    expect(q.items.map((i: { slug: string }) => i.slug)).toEqual(['phishing-101']);
    expect(q.items[0].media[0].url).toMatch(/^https:\/\/site\.test\/m\/phishing-101\/short\.mp4\?exp=\d+&sig=[0-9a-f]{64}$/);

    // The signed link serves the file; a tampered one does not.
    const link = new URL(q.items[0].media[0].url);
    expect((await desk.signedMedia('phishing-101/short.mp4', link)).status).toBe(200);
    link.searchParams.set('sig', '0'.repeat(64));
    expect((await desk.signedMedia('phishing-101/short.mp4', link)).status).toBe(404);

    // Restaging different content voids the approval.
    await call(stager, 'POST', 'stage', { slug: 'phishing-101', channel: 'youtube', post: { ...post, title: 'Changed' } });
    expect((await (await call(poster, 'GET', 'queue')).json()).items).toEqual([]);
    const plan = await desk.desk.plan();
    expect(plan.plan[0].channels.find((c) => c.channel === 'youtube')!.state).toBe('changed');
  });

  it('records outcomes and stops offering what was posted', async () => {
    const { desk, call } = setup();
    const post = { text: 'Thread', media: [] };
    const { content_sha } = await (await call(stager, 'POST', 'stage', { slug: 'phishing-101', channel: 'x', post })).json();
    await desk.desk.approve(admin.id, 'phishing-101', [`x:${content_sha}`]);
    await desk.desk.resume(admin.id);
    expect((await call(poster, 'POST', 'posted', { slug: 'phishing-101', channel: 'x', content_sha, status: 'posted', url: 'https://x.com/1' })).status).toBe(200);
    expect((await (await call(poster, 'GET', 'queue')).json()).items).toEqual([]);
  });

  it('moves a piece to the next slot and reports the change to the schedule job', async () => {
    const { desk, call } = setup('2026-11-10');
    expect((await desk.desk.makeNext(admin.id, 'later-one')).ok).toMatch(/later-one to 2026-11-20/);
    expect((await (await call(poster, 'GET', 'schedule')).json()).changes).toEqual(
      expect.arrayContaining([{ slug: 'later-one', publish_date: '2026-11-20' }, { slug: 'phishing-101', publish_date: '2026-12-01' }]));
  });

  it('threads requests and lets the producing machine answer them', async () => {
    const { desk, call } = setup();
    await desk.desk.request(admin.id, 'phishing-101', 'edit', 'Slow the second scene down');
    const open = await (await call(stager, 'GET', 'requests')).json();
    expect(open.requests).toHaveLength(1);
    await call(stager, 'POST', 'requests', { id: open.requests[0].id, reply: 'Done: +1.5s', status: 'done' });
    expect((await (await call(stager, 'GET', 'requests')).json()).requests).toEqual([]);
  });

  it('keeps machines to their own endpoints', () => {
    expect(allowed('poster', '/api/admin/queue', 'GET')).toBe(true);
    expect(allowed('poster', '/api/admin/stage', 'POST')).toBe(false);
    expect(allowed('stager', '/api/admin/media/a/b.mp4', 'PUT')).toBe(true);
    expect(allowed('stager', '/api/admin/queue', 'GET')).toBe(false);
  });
});
