// The posting desk's rules: what is staged, what an approval covers, what may go out and when. Plain functions over
// plain rows, no storage and no framework (tested in spec/rules.spec.ts). Stores live in ./store.ts and ./cloudflare.

export const CHANNELS = ['youtube', 'instagram_reel', 'instagram_carousel', 'x'] as const;
export type Channel = (typeof CHANNELS)[number];
export const CHANNEL_NAMES: Record<Channel, string> = { youtube: 'YouTube', instagram_reel: 'Instagram Reel', instagram_carousel: 'Instagram carousel', x: 'X' };
export const isChannel = (c: string): c is Channel => (CHANNELS as readonly string[]).includes(c);

export interface MediaRef { key: string; sha256: string; type: string }
export interface StagedPost {
  title?: string; description?: string; tags?: string[];      // youtube
  caption?: string;                                           // instagram
  text?: string; thread?: string[];                           // x
  short?: boolean;                                            // youtube: a Short (9:16) or a regular video
  media: MediaRef[];
}
export interface StagedRow { slug: string; channel: Channel; post: StagedPost; content_sha: string; staged_by: string; staged_at: string }
export interface ApprovalRow { id: number; slug: string; channel: Channel; content_sha: string; approved_by: string; approved_at: string; revoked_at: string | null }
export interface PostRow { id: number; slug: string; channel: Channel; content_sha: string; status: 'posted' | 'dry-run' | 'failed'; url: string | null; external_id: string | null; detail: string | null; run: string | null; at: string }

const enc = new TextEncoder();
export async function sha256(data: string | ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** JSON with sorted keys, so the same post always fingerprints the same. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).sort().map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}
/** The fingerprint an approval is given for: the channel and everything that goes out on it, media by sha256. */
export const contentSha = (channel: Channel, post: StagedPost) => sha256(canonical({ channel, post }));

// ── Rules ────────────────────────────────────────────────────────────────────────────────────────────────

export type ChannelState = 'not-staged' | 'awaiting' | 'changed' | 'approved' | 'posted' | 'failed';
/** Where one article's channel stands. An approval counts only for the exact content now staged. */
export function channelState(staged: StagedRow | undefined, approvals: ApprovalRow[], posts: PostRow[]): ChannelState {
  if (posts.some((p) => p.status === 'posted')) return 'posted';
  if (!staged) return 'not-staged';
  const live = approvals.filter((a) => !a.revoked_at);
  if (live.some((a) => a.content_sha === staged.content_sha)) {
    const last = posts.filter((p) => p.content_sha === staged.content_sha).at(-1);
    return last?.status === 'failed' ? 'failed' : 'approved';
  }
  return live.length ? 'changed' : 'awaiting';
}

/** What the poster may post now: approved for the staged content, not yet posted, article date reached, not paused. */
export function due(
  rows: { slug: string; date: string; planned?: string; staged: StagedRow[]; approvals: ApprovalRow[]; posts: PostRow[] }[],
  today: string, paused: boolean,
): StagedRow[] {
  if (paused) return [];
  const out: StagedRow[] = [];
  for (const r of rows) {
    // `date` is the article's date as built (it is live on the site); `planned` is the date set in /admin. Both must
    // have come, so nothing is posted for an article the site has not published yet.
    if (r.date > today || (r.planned ?? r.date) > today) continue;
    for (const s of r.staged) {
      const state = channelState(s, r.approvals.filter((a) => a.channel === s.channel), r.posts.filter((p) => p.channel === s.channel));
      if (state === 'approved') out.push(s);
    }
  }
  return out;
}

/** Where a signed media URL points and how long it lives: the site's origin, the media route's path (default /m),
 *  seconds until it expires (default an hour) and the clock (default now, in ms). */
export interface SignOptions { origin: string; path?: string; ttl?: number; now?: number }

/** A short-lived, signed public URL for one media file (Instagram fetches media from a URL). */
export async function signMedia(key: string, secret: string, { origin, path = '/m', ttl = 3600, now = Date.now() }: SignOptions) {
  const exp = Math.floor(now / 1000) + ttl;
  const sig = await hmac(secret, `${key}:${exp}`);
  return `${origin}${path}/${key.split('/').map(encodeURIComponent).join('/')}?exp=${exp}&sig=${sig}`;
}
export async function checkSignature(key: string, exp: string, sig: string, secret: string, now = Date.now()) {
  if (!secret || !/^\d+$/.test(exp) || Number(exp) * 1000 < now) return false;
  const want = await hmac(secret, `${key}:${exp}`);
  if (want.length !== sig.length) return false;
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return d === 0;
}
async function hmac(secret: string, msg: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const s = await crypto.subtle.sign('HMAC', k, enc.encode(msg));
  return [...new Uint8Array(s)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Media keys: <slug>/<file>, lower-case, no path tricks. */
export const validKey = (k: string) => /^[a-z0-9-]+\/[a-z0-9._-]+$/.test(k) && !k.includes('..');

// ── Planning ────────────────────────────────────────────────────────────────────────────────────────────

/** Each article's publish date as set in /admin, else as built from index.json. */
export function effectiveDates(articles: { slug: string; date: string }[], overrides: { slug: string; publish_date: string }[]) {
  const o = new Map(overrides.map((r) => [r.slug, r.publish_date]));
  return new Map(articles.map((a) => [a.slug, o.get(a.slug) ?? a.date]));
}

/**
 * "Make next": `slug` takes the first upcoming publishing slot and every other upcoming article moves down one slot.
 * The slots (dates) stay where they are; only which article sits in each changes. Upcoming = dated after today.
 * Returns the new date of every article that moves.
 */
export function makeNext(dates: Map<string, string>, slug: string, today: string): Map<string, string> {
  const upcoming = [...dates].filter(([, d]) => d > today).sort((a, b) => a[1].localeCompare(b[1]) || a[0].localeCompare(b[0]));
  if (!upcoming.some(([s]) => s === slug)) return new Map();
  const slots = upcoming.map(([, d]) => d);
  const order = [slug, ...upcoming.map(([s]) => s).filter((s) => s !== slug)];
  const moved = new Map<string, string>();
  order.forEach((s, i) => { if (dates.get(s) !== slots[i]) moved.set(s, slots[i]); });
  return moved;
}

export interface Production { motion?: boolean; film?: boolean; takes?: number; takesNeeded?: number; render?: boolean; short?: boolean; carousel?: number }

export interface RequestRow { id: number; slug: string; kind: string; body: string; author: string; at: string; status: string; parent: number | null }
export interface AuditRow { id: number; at: string; actor: string; action: string; slug: string | null; channel: string | null; detail: string | null }
