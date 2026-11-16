// Where the desk keeps its rows. The rules (./rules.ts) never touch storage; the API (./api.ts) talks to a
// PostingStore and a MediaStore. ./cloudflare has D1 + R2; memoryStore() is for tests, demos and local dev; any other
// database (Postgres, SQLite, KV) only needs these methods.
import { contentSha, type ApprovalRow, type AuditRow, type Channel, type PostRow, type Production, type RequestRow, type StagedPost, type StagedRow } from './rules.js';

export interface DeskState {
  staged: StagedRow[]; approvals: ApprovalRow[]; posts: PostRow[]; paused: boolean;
  schedule: { slug: string; publish_date: string }[];
}

export interface PostingStore {
  readAll(): Promise<DeskState>;
  recentAudit(n?: number): Promise<AuditRow[]>;
  audit(actor: string, action: string, slug?: string | null, channel?: string | null, detail?: string): Promise<void>;
  /** Stores the post as it will go out; returns its fingerprint (restaging changes it, so old approvals lapse). */
  stage(actor: string, slug: string, channel: Channel, post: StagedPost): Promise<string>;
  /** Approves only the content the approver saw: false if it was restaged since. */
  approve(actor: string, slug: string, channel: Channel, contentShaSeen: string): Promise<boolean>;
  revoke(actor: string, slug: string, channel: Channel): Promise<void>;
  setPaused(actor: string, paused: boolean): Promise<void>;
  recordPost(actor: string, p: { slug: string; channel: Channel; content_sha: string; status: PostRow['status']; url?: string; external_id?: string; detail?: string; run?: string }): Promise<void>;
  readSchedule(): Promise<{ slug: string; publish_date: string }[]>;
  setDates(actor: string, moved: Map<string, string>, why: string): Promise<void>;
  readProduction(): Promise<{ slug: string; script: string | null; status: Production; updated_at: string }[]>;
  saveProduction(slug: string, script: string | null, status: Production): Promise<void>;
  readRequests(openOnly?: boolean): Promise<RequestRow[]>;
  addRequest(actor: string, slug: string, kind: string, body: string, parent?: number | null): Promise<void>;
  setRequestStatus(actor: string, id: number, status: string): Promise<void>;
}

/** Media files (rendered video, cover images, captions), kept private and addressed as <slug>/<file>. */
export interface MediaObject { body: ReadableStream | ArrayBuffer; size: number; contentType?: string; sha256?: string }
export interface MediaStore {
  get(key: string): Promise<MediaObject | null>;
  head(key: string): Promise<{ size: number; sha256?: string } | null>;
  put(key: string, body: ArrayBuffer, o: { contentType: string; sha256: string }): Promise<void>;
}

const now = () => new Date().toISOString();

/** Everything in memory. Starts paused, like the real one. */
export function memoryStore(): PostingStore & { media: MediaStore } {
  const s: DeskState = { staged: [], approvals: [], posts: [], paused: true, schedule: [] };
  const log: AuditRow[] = [], production = new Map<string, { slug: string; script: string | null; status: Production; updated_at: string }>();
  const requests: RequestRow[] = [], files = new Map<string, { bytes: ArrayBuffer; contentType: string; sha256: string }>();
  let id = 0;
  const store: PostingStore & { media: MediaStore } = {
    async readAll() { return structuredClone(s); },
    async recentAudit(n = 40) { return log.slice(-n).reverse(); },
    async audit(actor, action, slug = null, channel = null, detail) { log.push({ id: ++id, at: now(), actor, action, slug, channel, detail: detail ?? null }); },
    async stage(actor, slug, channel, post) {
      const sha = await contentSha(channel, post);
      s.staged = s.staged.filter((r) => !(r.slug === slug && r.channel === channel));
      s.staged.push({ slug, channel, post: structuredClone(post), content_sha: sha, staged_by: actor, staged_at: now() });
      await store.audit(actor, 'stage', slug, channel, sha.slice(0, 12));
      return sha;
    },
    async approve(actor, slug, channel, seen) {
      const row = s.staged.find((r) => r.slug === slug && r.channel === channel);
      if (!row || row.content_sha !== seen) return false;
      s.approvals.push({ id: ++id, slug, channel, content_sha: seen, approved_by: actor, approved_at: now(), revoked_at: null });
      await store.audit(actor, 'approve', slug, channel, seen.slice(0, 12));
      return true;
    },
    async revoke(actor, slug, channel) {
      for (const a of s.approvals) if (a.slug === slug && a.channel === channel && !a.revoked_at) a.revoked_at = now();
      await store.audit(actor, 'revoke', slug, channel);
    },
    async setPaused(actor, paused) { s.paused = paused; await store.audit(actor, paused ? 'pause' : 'resume'); },
    async recordPost(actor, p) {
      s.posts.push({ id: ++id, slug: p.slug, channel: p.channel, content_sha: p.content_sha, status: p.status, url: p.url ?? null, external_id: p.external_id ?? null, detail: p.detail ?? null, run: p.run ?? null, at: now() });
      await store.audit(actor, p.status, p.slug, p.channel, p.url ?? p.detail);
    },
    async readSchedule() { return structuredClone(s.schedule); },
    async setDates(actor, moved, why) {
      if (!moved.size) return;
      for (const [slug, d] of moved) { s.schedule = s.schedule.filter((x) => x.slug !== slug); s.schedule.push({ slug, publish_date: d }); }
      await store.audit(actor, 'reorder', null, null, `${why}: ${[...moved].map(([x, d]) => `${x}→${d}`).join(', ')}`);
    },
    async readProduction() { return [...production.values()]; },
    async saveProduction(slug, script, status) { production.set(slug, { slug, script, status, updated_at: now() }); },
    async readRequests(openOnly = false) { return requests.filter((r) => !openOnly || (!r.parent && r.status !== 'done')); },
    async addRequest(actor, slug, kind, body, parent = null) {
      requests.push({ id: ++id, slug, kind, body: body.slice(0, 4000), author: actor, at: now(), status: 'open', parent });
      await store.audit(actor, parent ? 'reply' : `request:${kind}`, slug, null, body.slice(0, 200));
    },
    async setRequestStatus(actor, rid, status) {
      const r = requests.find((x) => x.id === rid); if (r) r.status = status;
      await store.audit(actor, `request:${status}`, null, null, `#${rid}`);
    },
    media: {
      async get(key) { const f = files.get(key); return f ? { body: f.bytes, size: f.bytes.byteLength, contentType: f.contentType, sha256: f.sha256 } : null; },
      async head(key) { const f = files.get(key); return f ? { size: f.bytes.byteLength, sha256: f.sha256 } : null; },
      async put(key, bytes, o) { files.set(key, { bytes, ...o }); },
    },
  };
  return store;
}
