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

type ProductionRow = { slug: string; script: string | null; status: Production; updated_at: string };
type RecordedPost = Parameters<PostingStore['recordPost']>[1];

/** Media files in a map. Its methods are own properties, so they work taken off the object. */
class MemoryMedia implements MediaStore {
  #files = new Map<string, { bytes: ArrayBuffer; contentType: string; sha256: string }>();
  get = async (key: string): Promise<MediaObject | null> => {
    const f = this.#files.get(key);
    return f ? { body: f.bytes, size: f.bytes.byteLength, contentType: f.contentType, sha256: f.sha256 } : null;
  };
  head = async (key: string) => {
    const f = this.#files.get(key);
    return f ? { size: f.bytes.byteLength, sha256: f.sha256 } : null;
  };
  put = async (key: string, bytes: ArrayBuffer, o: { contentType: string; sha256: string }) => { this.#files.set(key, { bytes, ...o }); };
}

/**
 * The desk's rows in memory. Its methods are own properties (no private state shows), so they work taken off the
 * object; each one audits through `this.audit`, the store's own. One id sequence numbers every row.
 */
class MemoryStore implements PostingStore {
  #s: DeskState = { staged: [], approvals: [], posts: [], paused: true, schedule: [] };
  #log: AuditRow[] = [];
  #production = new Map<string, ProductionRow>();
  #requests: RequestRow[] = [];
  #id = 0;

  readAll = async () => structuredClone(this.#s);
  recentAudit = async (n = 40) => this.#log.slice(-n).reverse();
  audit = async (actor: string, action: string, slug: string | null = null, channel: string | null = null, detail?: string) => {
    this.#log.push({ id: ++this.#id, at: now(), actor, action, slug, channel, detail: detail ?? null });
  };
  stage = async (actor: string, slug: string, channel: Channel, post: StagedPost) => {
    const sha = await contentSha(channel, post);
    this.#s.staged = this.#s.staged.filter((r) => !(r.slug === slug && r.channel === channel));
    this.#s.staged.push({ slug, channel, post: structuredClone(post), content_sha: sha, staged_by: actor, staged_at: now() });
    await this.audit(actor, 'stage', slug, channel, sha.slice(0, 12));
    return sha;
  };
  approve = async (actor: string, slug: string, channel: Channel, seen: string) => {
    const row = this.#s.staged.find((r) => r.slug === slug && r.channel === channel);
    if (!row || row.content_sha !== seen) return false;
    this.#s.approvals.push({ id: ++this.#id, slug, channel, content_sha: seen, approved_by: actor, approved_at: now(), revoked_at: null });
    await this.audit(actor, 'approve', slug, channel, seen.slice(0, 12));
    return true;
  };
  revoke = async (actor: string, slug: string, channel: Channel) => {
    const live = this.#s.approvals.filter((a) => a.slug === slug && a.channel === channel && !a.revoked_at);
    for (const a of live) a.revoked_at = now();
    await this.audit(actor, 'revoke', slug, channel);
  };
  setPaused = async (actor: string, paused: boolean) => { this.#s.paused = paused; await this.audit(actor, paused ? 'pause' : 'resume'); };
  recordPost = async (actor: string, p: RecordedPost) => {
    this.#s.posts.push({ id: ++this.#id, slug: p.slug, channel: p.channel, content_sha: p.content_sha, status: p.status, url: p.url ?? null, external_id: p.external_id ?? null, detail: p.detail ?? null, run: p.run ?? null, at: now() });
    await this.audit(actor, p.status, p.slug, p.channel, p.url ?? p.detail);
  };
  readSchedule = async () => structuredClone(this.#s.schedule);
  setDates = async (actor: string, moved: Map<string, string>, why: string) => {
    if (!moved.size) return;
    for (const [slug, d] of moved) { this.#s.schedule = this.#s.schedule.filter((x) => x.slug !== slug); this.#s.schedule.push({ slug, publish_date: d }); }
    await this.audit(actor, 'reorder', null, null, `${why}: ${[...moved].map(([x, d]) => `${x}→${d}`).join(', ')}`);
  };
  readProduction = async () => [...this.#production.values()];
  saveProduction = async (slug: string, script: string | null, status: Production) => { this.#production.set(slug, { slug, script, status, updated_at: now() }); };
  readRequests = async (openOnly = false) => this.#requests.filter((r) => !openOnly || (!r.parent && r.status !== 'done'));
  addRequest = async (actor: string, slug: string, kind: string, body: string, parent: number | null = null) => {
    this.#requests.push({ id: ++this.#id, slug, kind, body: body.slice(0, 4000), author: actor, at: now(), status: 'open', parent });
    await this.audit(actor, parent ? 'reply' : `request:${kind}`, slug, null, body.slice(0, 200));
  };
  setRequestStatus = async (actor: string, rid: number, status: string) => {
    const r = this.#requests.find((x) => x.id === rid); if (r) r.status = status;
    await this.audit(actor, `request:${status}`, null, null, `#${rid}`);
  };
  media: MediaStore = new MemoryMedia();
}

/** Everything in memory. Starts paused, like the real one. */
export function memoryStore(): PostingStore & { media: MediaStore } {
  return new MemoryStore();
}
