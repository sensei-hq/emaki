// The in-memory store, method by method: what it keeps, what it audits, and what it hands back.
import { describe, expect, it } from 'vitest';
import { contentSha, memoryStore } from '../src/index.js';

const post = { text: 'hi', media: [] };

describe('memory store', () => {
  it('starts paused and empty, and hands out copies', async () => {
    const s = memoryStore();
    const all = await s.readAll();
    expect(all).toEqual({ staged: [], approvals: [], posts: [], paused: true, schedule: [] });
    all.staged.push({} as never);
    expect((await s.readAll()).staged).toEqual([]);
    expect(await s.recentAudit()).toEqual([]);
  });

  it('stages one row per piece and channel, fingerprinted, and audits it', async () => {
    const s = memoryStore();
    const sha = await s.stage('mac', 'a', 'x', post);
    expect(sha).toBe(await contentSha('x', post));
    await s.stage('mac', 'a', 'x', { ...post, text: 'again' });
    const yt = await s.stage('mac', 'a', 'youtube', post);
    const { staged } = await s.readAll();
    expect(staged.map((r) => [r.slug, r.channel, r.post.text, r.staged_by])).toEqual([['a', 'x', 'again', 'mac'], ['a', 'youtube', 'hi', 'mac']]);
    expect((await s.recentAudit())[0]).toMatchObject({ actor: 'mac', action: 'stage', slug: 'a', channel: 'youtube', detail: yt.slice(0, 12) });
  });

  it('approves only the content staged now; revoke withdraws live approvals', async () => {
    const s = memoryStore();
    expect(await s.approve('me', 'a', 'x', 'nope')).toBe(false);
    const sha = await s.stage('mac', 'a', 'x', post);
    expect(await s.approve('me', 'a', 'x', 'nope')).toBe(false);
    expect(await s.approve('me', 'a', 'x', sha)).toBe(true);
    expect((await s.readAll()).approvals[0]).toMatchObject({ slug: 'a', channel: 'x', content_sha: sha, approved_by: 'me', revoked_at: null });
    expect((await s.recentAudit())[0]).toMatchObject({ action: 'approve', detail: sha.slice(0, 12) });
    await s.revoke('me', 'a', 'x');
    expect((await s.readAll()).approvals[0].revoked_at).not.toBeNull();
    expect((await s.recentAudit())[0]).toMatchObject({ action: 'revoke', slug: 'a', channel: 'x', detail: null });
  });

  it('pauses, resumes and records posts with their audit detail', async () => {
    const s = memoryStore();
    await s.setPaused('me', false);
    expect((await s.readAll()).paused).toBe(false);
    expect((await s.recentAudit())[0].action).toBe('resume');
    await s.setPaused('me', true);
    expect((await s.recentAudit())[0].action).toBe('pause');
    await s.recordPost('ci', { slug: 'a', channel: 'x', content_sha: 'c', status: 'posted', url: 'https://x/1' });
    await s.recordPost('ci', { slug: 'a', channel: 'x', content_sha: 'c', status: 'failed', detail: 'boom' });
    expect((await s.readAll()).posts.map((p) => [p.status, p.url, p.detail, p.external_id, p.run])).toEqual([['posted', 'https://x/1', null, null, null], ['failed', null, 'boom', null, null]]);
    expect((await s.recentAudit(2)).map((a) => [a.action, a.detail])).toEqual([['failed', 'boom'], ['posted', 'https://x/1']]);
  });

  it('keeps one date per piece and audits the move; an empty move does nothing', async () => {
    const s = memoryStore();
    await s.setDates('me', new Map(), 'why');
    expect(await s.recentAudit()).toEqual([]);
    await s.setDates('me', new Map([['a', '2026-01-01'], ['b', '2026-01-02']]), 'make next: a');
    await s.setDates('me', new Map([['a', '2026-01-03']]), 'again');
    expect(await s.readSchedule()).toEqual([{ slug: 'b', publish_date: '2026-01-02' }, { slug: 'a', publish_date: '2026-01-03' }]);
    expect((await s.recentAudit()).map((a) => a.detail)).toEqual(['again: a→2026-01-03', 'make next: a: a→2026-01-01, b→2026-01-02']);
  });

  it('saves production per piece', async () => {
    const s = memoryStore();
    await s.saveProduction('a', null, {});
    await s.saveProduction('a', 'script', { film: true });
    expect((await s.readProduction()).map((p) => [p.slug, p.script, p.status])).toEqual([['a', 'script', { film: true }]]);
  });

  it('threads requests, trims bodies, sets status and audits even an unknown id', async () => {
    const s = memoryStore();
    await s.addRequest('me', 'a', 'edit', 'b'.repeat(5000));
    const [r] = await s.readRequests();
    expect(r.body).toHaveLength(4000);
    expect(r).toMatchObject({ slug: 'a', kind: 'edit', author: 'me', status: 'open', parent: null });
    expect((await s.recentAudit())[0]).toMatchObject({ action: 'request:edit', slug: 'a', detail: 'b'.repeat(200) });
    await s.addRequest('mac', 'a', 'note', 'reply', r.id);
    expect((await s.recentAudit())[0].action).toBe('reply');
    expect(await s.readRequests(true)).toHaveLength(1);
    await s.setRequestStatus('mac', r.id, 'done');
    expect(await s.readRequests(true)).toEqual([]);
    expect(await s.readRequests()).toHaveLength(2);
    await s.setRequestStatus('mac', 999, 'done');
    expect((await s.recentAudit())[0]).toMatchObject({ action: 'request:done', slug: null, detail: '#999' });
  });

  it('gives each audit row and record its own increasing id, and the latest audit first, 40 by default', async () => {
    const s = memoryStore();
    for (let i = 0; i < 45; i++) await s.audit('me', `a${i}`);
    const recent = await s.recentAudit();
    expect(recent).toHaveLength(40);
    expect(recent[0]).toMatchObject({ id: 45, action: 'a44', slug: null, channel: null, detail: null });
    await s.addRequest('me', 'a', 'edit', 'x');
    expect((await s.readRequests())[0].id).toBe(46);
  });

  it('keeps media files with their type and sha256', async () => {
    const s = memoryStore();
    expect(await s.media.get('a/b')).toBeNull();
    expect(await s.media.head('a/b')).toBeNull();
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    await s.media.put('a/b', bytes, { contentType: 'video/mp4', sha256: 'abc' });
    expect(await s.media.get('a/b')).toEqual({ body: bytes, size: 3, contentType: 'video/mp4', sha256: 'abc' });
    expect(await s.media.head('a/b')).toEqual({ size: 3, sha256: 'abc' });
  });

  it('works with its methods taken off the object', async () => {
    const s = memoryStore();
    const { stage, approve, readAll } = s;
    const sha = await stage('mac', 'a', 'x', post);
    expect(await approve('me', 'a', 'x', sha)).toBe(true);
    expect((await readAll()).approvals).toHaveLength(1);
  });
});
