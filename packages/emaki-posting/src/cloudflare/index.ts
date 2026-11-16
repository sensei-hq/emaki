// The desk on Cloudflare: rows in D1 (migrations/ in this package), media in a private R2 bucket. The binding
// shapes are declared here, so this needs no Cloudflare types package.
import { contentSha, type ApprovalRow, type AuditRow, type PostRow, type Production, type RequestRow, type StagedRow } from '../rules.js';
import type { MediaStore, PostingStore } from '../store.js';

export interface D1Stmt { bind(...v: unknown[]): D1Stmt; all<T = Record<string, unknown>>(): Promise<{ results: T[] }>; first<T = Record<string, unknown>>(): Promise<T | null>; run(): Promise<unknown> }
export interface D1 { prepare(sql: string): D1Stmt; batch(s: D1Stmt[]): Promise<unknown> }
export interface R2Object { body: ReadableStream; size: number; httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
export interface R2 {
  get(key: string): Promise<R2Object | null>;
  head(key: string): Promise<{ size: number; customMetadata?: Record<string, string> } | null>;
  put(key: string, body: ReadableStream | ArrayBuffer, o?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }): Promise<unknown>;
}

const nowIso = () => new Date().toISOString();
const parse = (r: Record<string, unknown>): StagedRow => ({ ...(r as unknown as StagedRow), post: JSON.parse(String(r.post)) });

export function d1Store(db: D1): PostingStore {
  const audit: PostingStore['audit'] = async (actor, action, slug, channel, detail) => {
    await db.prepare('INSERT INTO audit (at, actor, action, slug, channel, detail) VALUES (?, ?, ?, ?, ?, ?)').bind(nowIso(), actor, action, slug ?? null, channel ?? null, detail ?? null).run();
  };
  const readRequests: PostingStore['readRequests'] = (openOnly = false) =>
    db.prepare(`SELECT * FROM requests ${openOnly ? "WHERE parent IS NULL AND status != 'done'" : ''} ORDER BY id`).all<RequestRow>().then((r) => r.results);
  return {
    audit,
    async readAll() {
      const [staged, approvals, posts, settings, schedule] = await Promise.all([
        db.prepare('SELECT * FROM staged').all(),
        db.prepare('SELECT * FROM approvals ORDER BY id').all<ApprovalRow>(),
        db.prepare('SELECT * FROM posts ORDER BY id').all<PostRow>(),
        db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>(),
        db.prepare('SELECT slug, publish_date FROM schedule').all<{ slug: string; publish_date: string }>(),
      ]);
      return {
        staged: staged.results.map(parse), approvals: approvals.results, posts: posts.results,
        paused: (settings.results.find((s) => s.key === 'paused')?.value ?? '1') !== '0',
        schedule: schedule.results,
      };
    },
    recentAudit: (n = 40) => db.prepare('SELECT * FROM audit ORDER BY id DESC LIMIT ?').bind(n).all<AuditRow>().then((r) => r.results),
    async stage(actor, slug, channel, post) {
      const sha = await contentSha(channel, post);
      await db.prepare('INSERT INTO staged (slug, channel, post, content_sha, staged_by, staged_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (slug, channel) DO UPDATE SET post = excluded.post, content_sha = excluded.content_sha, staged_by = excluded.staged_by, staged_at = excluded.staged_at')
        .bind(slug, channel, JSON.stringify(post), sha, actor, nowIso()).run();
      await audit(actor, 'stage', slug, channel, sha.slice(0, 12));
      return sha;
    },
    async approve(actor, slug, channel, seen) {
      const row = await db.prepare('SELECT content_sha FROM staged WHERE slug = ? AND channel = ?').bind(slug, channel).first<{ content_sha: string }>();
      if (!row || row.content_sha !== seen) return false;
      await db.prepare('INSERT INTO approvals (slug, channel, content_sha, approved_by, approved_at) VALUES (?, ?, ?, ?, ?)').bind(slug, channel, row.content_sha, actor, nowIso()).run();
      await audit(actor, 'approve', slug, channel, row.content_sha.slice(0, 12));
      return true;
    },
    async revoke(actor, slug, channel) {
      await db.prepare('UPDATE approvals SET revoked_at = ? WHERE slug = ? AND channel = ? AND revoked_at IS NULL').bind(nowIso(), slug, channel).run();
      await audit(actor, 'revoke', slug, channel);
    },
    async setPaused(actor, paused) {
      await db.prepare("INSERT INTO settings (key, value) VALUES ('paused', ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value").bind(paused ? '1' : '0').run();
      await audit(actor, paused ? 'pause' : 'resume');
    },
    async recordPost(actor, p) {
      await db.prepare('INSERT INTO posts (slug, channel, content_sha, status, url, external_id, detail, run, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(p.slug, p.channel, p.content_sha, p.status, p.url ?? null, p.external_id ?? null, p.detail ?? null, p.run ?? null, nowIso()).run();
      await audit(actor, p.status, p.slug, p.channel, p.url ?? p.detail);
    },
    readSchedule: () => db.prepare('SELECT slug, publish_date FROM schedule').all<{ slug: string; publish_date: string }>().then((r) => r.results),
    async setDates(actor, moved, why) {
      if (!moved.size) return;
      const now = nowIso();
      await db.batch([...moved].map(([slug, d]) => db.prepare('INSERT INTO schedule (slug, publish_date, set_by, set_at) VALUES (?, ?, ?, ?) ON CONFLICT (slug) DO UPDATE SET publish_date = excluded.publish_date, set_by = excluded.set_by, set_at = excluded.set_at').bind(slug, d, actor, now)));
      await audit(actor, 'reorder', null, null, `${why}: ${[...moved].map(([s, d]) => `${s}→${d}`).join(', ')}`.slice(0, 1900));
    },
    readProduction: () =>
      db.prepare('SELECT slug, script, status, updated_at FROM production').all<{ slug: string; script: string | null; status: string; updated_at: string }>()
        .then((r) => r.results.map((x) => ({ ...x, status: JSON.parse(x.status) as Production }))),
    async saveProduction(slug, script, status) {
      await db.prepare('INSERT INTO production (slug, script, status, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (slug) DO UPDATE SET script = excluded.script, status = excluded.status, updated_at = excluded.updated_at')
        .bind(slug, script, JSON.stringify(status), nowIso()).run();
    },
    readRequests,
    async addRequest(actor, slug, kind, body, parent = null) {
      await db.prepare('INSERT INTO requests (slug, kind, body, author, at, parent) VALUES (?, ?, ?, ?, ?, ?)').bind(slug, kind, body.slice(0, 4000), actor, nowIso(), parent).run();
      await audit(actor, parent ? 'reply' : `request:${kind}`, slug, null, body.slice(0, 200));
    },
    async setRequestStatus(actor, id, status) {
      await db.prepare('UPDATE requests SET status = ? WHERE id = ?').bind(status, id).run();
      await audit(actor, `request:${status}`, null, null, `#${id}`);
    },
  };
}

export function r2Media(bucket: R2): MediaStore {
  return {
    async get(key) {
      const o = await bucket.get(key);
      return o ? { body: o.body, size: o.size, contentType: o.httpMetadata?.contentType, sha256: o.customMetadata?.sha256 } : null;
    },
    async head(key) { const h = await bucket.head(key); return h ? { size: h.size, sha256: h.customMetadata?.sha256 } : null; },
    async put(key, body, o) { await bucket.put(key, body, { httpMetadata: { contentType: o.contentType }, customMetadata: { sha256: o.sha256 } }); },
  };
}
