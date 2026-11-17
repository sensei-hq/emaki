// The Cloudflare adapter over a real SQLite database (node:sqlite) wearing D1's shape, built from this package's
// migrations, and an in-memory bucket wearing R2's: the rows and files the desk reads back are the ones it wrote.
import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { d1Store, r2Media, type D1, type D1Stmt, type R2, type R2Object } from '../src/cloudflare/index.js';
import { contentSha, createDesk, sha256, type Caller } from '../src/index.js';

const migrations = new URL('../migrations/', import.meta.url);

/** D1 over node:sqlite: prepare/bind/all/first/run and batch, the subset the adapter uses. */
function sqliteD1() {
  const db = new DatabaseSync(':memory:');
  const script: (sql: string) => void = db.exec.bind(db);
  for (const f of readdirSync(migrations).sort()) script(readFileSync(new URL(f, migrations), 'utf-8'));
  const plain = <T>(r: unknown) => ({ ...(r as object) }) as T;
  const stmt = (sql: string, values: unknown[] = []): D1Stmt => ({
    bind: (...v) => stmt(sql, v),
    all: async <T>() => ({ results: db.prepare(sql).all(...(values as never[])).map((r) => plain<T>(r)) }),
    first: async <T>() => { const r = db.prepare(sql).get(...(values as never[])); return r ? plain<T>(r) : null; },
    run: async () => db.prepare(sql).run(...(values as never[])),
  });
  const batches: number[] = [];
  const d1: D1 = {
    prepare: (sql) => stmt(sql),
    async batch(s) { batches.push(s.length); script('BEGIN'); for (const x of s) await x.run(); script('COMMIT'); return []; },
  };
  return { d1, script, batches, rows: (sql: string) => db.prepare(sql).all().map((r) => ({ ...r })) };
}

/** R2 in memory: a stream back from get(), metadata as written. */
function memoryR2() {
  const files = new Map<string, { bytes: Uint8Array; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }>();
  const bucket: R2 = {
    async get(key) {
      const f = files.get(key);
      if (!f) return null;
      return { body: new Blob([f.bytes as Uint8Array<ArrayBuffer>]).stream(), size: f.bytes.byteLength, httpMetadata: f.httpMetadata, customMetadata: f.customMetadata } satisfies R2Object;
    },
    async head(key) { const f = files.get(key); return f ? { size: f.bytes.byteLength, customMetadata: f.customMetadata } : null; },
    async put(key, body, o) { files.set(key, { bytes: new Uint8Array(await new Response(body).arrayBuffer()), ...o }); },
  };
  return { bucket, files };
}

describe('d1Store', () => {
  it('starts paused (the migration seeds it) and reads an empty desk', async () => {
    const store = d1Store(sqliteD1().d1);
    expect(await store.readAll()).toEqual({ staged: [], approvals: [], posts: [], paused: true, schedule: [] });
  });

  it('pauses and resumes through the settings row, and reads a missing row as paused', async () => {
    const { d1, script, rows } = sqliteD1(), store = d1Store(d1);
    await store.setPaused('me@x.com', false);
    expect((await store.readAll()).paused).toBe(false);
    await store.setPaused('me@x.com', true);
    expect((await store.readAll()).paused).toBe(true);
    await store.setPaused('me@x.com', false);
    script("DELETE FROM settings WHERE key = 'paused'");
    expect((await store.readAll()).paused).toBe(true);
    expect(rows('SELECT actor, action, slug, channel, detail FROM audit ORDER BY id')).toEqual([
      { actor: 'me@x.com', action: 'resume', slug: null, channel: null, detail: null },
      { actor: 'me@x.com', action: 'pause', slug: null, channel: null, detail: null },
      { actor: 'me@x.com', action: 'resume', slug: null, channel: null, detail: null },
    ]);
  });

  it('stages a post as JSON under its fingerprint and restaging replaces it', async () => {
    const { d1, rows } = sqliteD1(), store = d1Store(d1);
    const post = { title: 'Spot the phish', media: [] };
    const sha = await store.stage('mac', 'phishing-101', 'youtube', post);
    expect(sha).toBe(await contentSha('youtube', post));
    const again = await store.stage('mac', 'phishing-101', 'youtube', { ...post, title: 'Changed' });
    expect(again).not.toBe(sha);
    const { staged } = await store.readAll();
    expect(staged).toHaveLength(1);
    expect(staged[0]).toMatchObject({ slug: 'phishing-101', channel: 'youtube', post: { title: 'Changed', media: [] }, content_sha: again, staged_by: 'mac' });
    expect(rows("SELECT detail FROM audit WHERE action = 'stage'").map((r) => r.detail)).toEqual([sha.slice(0, 12), again.slice(0, 12)]);
  });

  it('approves only the content the approver saw, and revokes', async () => {
    const { d1 } = sqliteD1(), store = d1Store(d1);
    expect(await store.approve('me', 'phishing-101', 'x', 'abc')).toBe(false);
    const sha = await store.stage('mac', 'phishing-101', 'x', { text: 'Thread', media: [] });
    expect(await store.approve('me', 'phishing-101', 'x', 'stale')).toBe(false);
    expect(await store.approve('me', 'phishing-101', 'x', sha)).toBe(true);
    let { approvals } = await store.readAll();
    expect(approvals).toEqual([expect.objectContaining({ slug: 'phishing-101', channel: 'x', content_sha: sha, approved_by: 'me', revoked_at: null })]);
    await store.revoke('me', 'phishing-101', 'x');
    ({ approvals } = await store.readAll());
    expect(approvals[0].revoked_at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect((await store.recentAudit()).map((a) => a.action)).toEqual(['revoke', 'approve', 'stage']);
  });

  it('records outcomes with and without their optional fields', async () => {
    const { d1 } = sqliteD1(), store = d1Store(d1);
    await store.recordPost('ci', { slug: 'a', channel: 'x', content_sha: 's1', status: 'posted', url: 'https://x.com/1', external_id: '1', detail: 'ok', run: 'https://ci/1' });
    await store.recordPost('ci', { slug: 'a', channel: 'youtube', content_sha: 's2', status: 'failed', detail: 'quota' });
    await store.recordPost('ci', { slug: 'b', channel: 'x', content_sha: 's3', status: 'dry-run' });
    const { posts } = await store.readAll();
    expect(posts.map(({ slug, channel, status, url, external_id, detail, run }) => ({ slug, channel, status, url, external_id, detail, run }))).toEqual([
      { slug: 'a', channel: 'x', status: 'posted', url: 'https://x.com/1', external_id: '1', detail: 'ok', run: 'https://ci/1' },
      { slug: 'a', channel: 'youtube', status: 'failed', url: null, external_id: null, detail: 'quota', run: null },
      { slug: 'b', channel: 'x', status: 'dry-run', url: null, external_id: null, detail: null, run: null },
    ]);
    // The audit names the link when there is one, else the detail; newest first, limited on request.
    expect((await store.recentAudit(2)).map((a) => [a.action, a.detail])).toEqual([['dry-run', null], ['failed', 'quota']]);
    expect((await store.recentAudit()).at(-1)).toMatchObject({ action: 'posted', slug: 'a', channel: 'x', detail: 'https://x.com/1' });
  });

  it('writes the posting order in one batch, and nothing for no change', async () => {
    const { d1, batches, rows } = sqliteD1(), store = d1Store(d1);
    await store.setDates('me', new Map(), 'make next');
    expect(batches).toEqual([]);
    await store.setDates('me', new Map([['a', '2026-11-20'], ['b', '2026-12-01']]), 'make next');
    await store.setDates('me', new Map([['a', '2026-11-21']]), 'swap');
    expect(batches).toEqual([2, 1]);
    expect(await store.readSchedule()).toEqual(expect.arrayContaining([{ slug: 'a', publish_date: '2026-11-21' }, { slug: 'b', publish_date: '2026-12-01' }]));
    expect((await store.readAll()).schedule).toHaveLength(2);
    expect(rows("SELECT detail FROM audit WHERE action = 'reorder' ORDER BY id").map((r) => r.detail)).toEqual(['make next: a→2026-11-20, b→2026-12-01', 'swap: a→2026-11-21']);
  });

  it('keeps one production row per piece, its status as JSON', async () => {
    const { d1 } = sqliteD1(), store = d1Store(d1);
    await store.saveProduction('a', '# Day 1', { motion: true } as never);
    await store.saveProduction('a', null, { motion: true, render: true } as never);
    expect(await store.readProduction()).toEqual([{ slug: 'a', script: null, status: { motion: true, render: true }, updated_at: expect.any(String) }]);
  });

  it('threads requests: open ones are top-level and not done; replies and status changes are audited', async () => {
    const { d1 } = sqliteD1(), store = d1Store(d1);
    await store.addRequest('me', 'a', 'edit', 'Slow scene 2 down');
    await store.addRequest('me', 'b', 'note', 'x'.repeat(5000));
    let all = await store.readRequests();
    expect(all.map((r) => [r.id, r.slug, r.status, r.parent])).toEqual([[1, 'a', 'open', null], [2, 'b', 'open', null]]);
    expect(all[1].body).toHaveLength(4000);
    await store.addRequest('mac', 'a', 'edit', 'Done: +1.5s', 1);
    await store.setRequestStatus('mac', 1, 'done');
    all = await store.readRequests();
    expect(all).toHaveLength(3);
    expect((await store.readRequests(true)).map((r) => r.id)).toEqual([2]);
    expect((await store.recentAudit(3)).map((a) => [a.action, a.detail])).toEqual([['request:done', '#1'], ['reply', 'Done: +1.5s'], ['request:note', 'x'.repeat(200)]]);
  });
});

describe('r2Media', () => {
  it('stores files with their type and checksum, and reads them back (or null)', async () => {
    const { bucket, files } = memoryR2(), media = r2Media(bucket);
    expect(await media.get('a/short.mp4')).toBeNull();
    expect(await media.head('a/short.mp4')).toBeNull();
    const bytes = new TextEncoder().encode('fake mp4');
    await media.put('a/short.mp4', bytes.buffer as ArrayBuffer, { contentType: 'video/mp4', sha256: 'abc' });
    expect(files.get('a/short.mp4')).toMatchObject({ httpMetadata: { contentType: 'video/mp4' }, customMetadata: { sha256: 'abc' } });
    expect(await media.head('a/short.mp4')).toEqual({ size: 8, sha256: 'abc' });
    const got = await media.get('a/short.mp4');
    expect(got).toMatchObject({ size: 8, contentType: 'video/mp4', sha256: 'abc' });
    expect(await new Response(got!.body).text()).toBe('fake mp4');
  });

  it('reads objects written without metadata (by hand or another tool)', async () => {
    const { bucket, files } = memoryR2(), media = r2Media(bucket);
    files.set('a/cover.png', { bytes: new Uint8Array([1, 2, 3]) });
    expect(await media.head('a/cover.png')).toEqual({ size: 3, sha256: undefined });
    expect(await media.get('a/cover.png')).toMatchObject({ size: 3, contentType: undefined, sha256: undefined });
  });
});

describe('the desk on D1 and R2', () => {
  it('uploads, stages, approves and serves the queue from the database and the bucket', async () => {
    const { d1 } = sqliteD1(), { bucket } = memoryR2(), store = d1Store(d1);
    const desk = createDesk({
      store, media: r2Media(bucket), today: () => '2026-11-20', mediaSecret: 's3cret',
      pieces: () => [{ slug: 'phishing-101', date: '2026-11-20', video: 'short' }], pieceUrl: (s) => `https://site.test/stories/${s}`,
    });
    const stager: Caller = { role: 'stager', id: 'mac' }, poster: Caller = { role: 'poster', id: 'ci' };
    const call = (c: Caller, method: string, sub: string, body?: BodyInit, headers: Record<string, string> = {}) =>
      desk.api(new Request(`https://site.test/api/admin/${sub}`, { method, body, headers }), c, sub);

    const bytes = new TextEncoder().encode('fake mp4').buffer as ArrayBuffer, sum = await sha256(bytes);
    expect((await call(stager, 'PUT', 'media/phishing-101/short.mp4', bytes, { 'x-content-sha256': sum })).status).toBe(200);
    const post = { title: 'Spot the phish', media: [{ key: 'phishing-101/short.mp4', sha256: sum, type: 'video' }] };
    const { content_sha } = await (await call(stager, 'POST', 'stage', JSON.stringify({ slug: 'phishing-101', channel: 'youtube', post }))).json();
    expect((await desk.desk.approve('me@x.com', 'phishing-101', [`youtube:${content_sha}`])).ok).toBeTruthy();
    await desk.desk.resume('me@x.com');

    const q = await (await call(poster, 'GET', 'queue')).json();
    expect(q.items.map((i: { slug: string; channel: string }) => [i.slug, i.channel])).toEqual([['phishing-101', 'youtube']]);
    const res = await desk.signedMedia('phishing-101/short.mp4', new URL(q.items[0].media[0].url));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('video/mp4');
    expect(await res.text()).toBe('fake mp4');
  });
});
