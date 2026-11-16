// The desk's HTTP API as plain Web Request → Response, so it runs in any server that speaks fetch (SvelteKit, a
// Cloudflare Worker, Hono, Next.js route handlers, Bun, Deno). Machines use it: the producing machine stages posts and
// uploads media; the CI poster reads the approved queue and reports outcomes. People use the desk page, which calls
// the `desk` actions below from its own form handlers.
import { channelState, CHANNELS, checkSignature, due, effectiveDates, isChannel, makeNext, sha256, signMedia, validKey, type Channel, type Production, type StagedPost } from './rules.js';
import type { Caller } from './access.js';
import type { MediaStore, PostingStore } from './store.js';

/** One piece the desk knows about: its slug, its date as built, and (optionally) its kind. */
export interface Piece { slug: string; date: string; title?: string; video?: 'short' | 'wide' | string }

export interface DeskOptions {
  store: PostingStore;
  media: MediaStore;
  /** The pieces in the built site (index.json). */
  pieces: () => Piece[] | Promise<Piece[]>;
  /** Today in the site's time zone (YYYY-MM-DD). */
  today: () => string;
  /** The public link of a piece, for the posts. */
  pieceUrl: (slug: string) => string;
  /** Secret for the short-lived public media links (Instagram fetches media from a URL). Without it, no links. */
  mediaSecret?: string;
  /** Origin the signed media links point at (default: the request's). */
  mediaOrigin?: string;
  /** Path of the signed media route (default /m). */
  mediaPath?: string;
  /** Channels expected for a piece (default: Shorts go everywhere; wide films skip the carousel). */
  channelsFor?: (p: Piece) => Channel[];
}

const TYPES: Record<string, string> = { mp4: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', srt: 'text/plain; charset=utf-8', vtt: 'text/vtt' };
const MAX = 95 * 1024 * 1024; // under the Workers request-body limit

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const fail = (status: number, reason: string): never => { throw new HttpError(status, reason); };

export function createDesk(o: DeskOptions) {
  const { store, media } = o;
  const expected = o.channelsFor ?? ((p: Piece) => (p.video === 'short' ? [...CHANNELS] : (['youtube', 'instagram_reel', 'x'] as Channel[])));
  const slugs = async () => new Set((await o.pieces()).map((p) => p.slug));

  /** The API under the admin prefix: `sub` is the path after it ('queue', 'media/<slug>/<file>', ...). */
  async function api(request: Request, caller: Caller, sub: string): Promise<Response> {
    try {
      const m = request.method;
      if (sub === 'queue' && m === 'GET') return json(await queue(new URL(request.url).origin));
      if (sub === 'posted' && m === 'POST') return json(await posted(caller, await request.json()));
      if (sub === 'stage' && m === 'POST') return json(await stage(caller, await request.json()));
      if (sub === 'production' && m === 'POST') return json(await production(await request.json()));
      if (sub === 'schedule' && m === 'GET') return json(await schedule());
      if (sub === 'requests' && m === 'GET') return json(await openRequests());
      if (sub === 'requests' && m === 'POST') return json(await answerRequest(caller, await request.json()));
      if (sub.startsWith('media/')) {
        const key = sub.slice(6);
        if (m === 'GET') return await getMedia(key);
        if (m === 'PUT') return json(await putMedia(caller, key, request));
      }
      return json({ ok: false, reason: 'Not found' }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ ok: false, reason: e.message }, e.status);
      throw e;
    }
  }

  /** What is approved and due now, with short-lived media links. Empty while posting is paused. */
  async function queue(origin: string) {
    const all = await store.readAll(), t = o.today();
    const planned = new Map(all.schedule.map((s) => [s.slug, s.publish_date]));
    const pieces = await o.pieces();
    const rows = pieces.map((a) => ({
      slug: a.slug, date: a.date, planned: planned.get(a.slug),
      staged: all.staged.filter((s) => s.slug === a.slug), approvals: all.approvals.filter((x) => x.slug === a.slug), posts: all.posts.filter((p) => p.slug === a.slug),
    }));
    const base = o.mediaOrigin || origin;
    return {
      paused: all.paused, today: t,
      items: await Promise.all(due(rows, t, all.paused).map(async (s) => ({
        slug: s.slug, channel: s.channel, content_sha: s.content_sha, post: s.post, article: o.pieceUrl(s.slug),
        video: pieces.find((a) => a.slug === s.slug)?.video ?? 'short',
        media: await Promise.all(s.post.media.map(async (x) => ({ ...x, url: o.mediaSecret ? await signMedia(x.key, o.mediaSecret, base, 3600, Date.now(), o.mediaPath ?? '/m') : null }))),
      }))),
    };
  }

  async function posted(caller: Caller, b: Record<string, string>) {
    if (!b.slug || !isChannel(b.channel) || !b.content_sha || !['posted', 'dry-run', 'failed'].includes(b.status)) fail(400, 'slug, channel, content_sha and status are required');
    await store.recordPost(caller.id, { slug: b.slug, channel: b.channel as Channel, content_sha: b.content_sha, status: b.status as 'posted', url: b.url, external_id: b.external_id, detail: b.detail?.slice(0, 2000), run: b.run });
    return { ok: true };
  }

  /** The post for one piece and channel, as it will go out. Every media file must already be uploaded, same sha256. */
  async function stage(caller: Caller, b: { slug: string; channel: string; post: StagedPost }) {
    if (!(await slugs()).has(b.slug)) fail(400, `No piece "${b.slug}" in the index`);
    if (!isChannel(b.channel) || !b.post || !Array.isArray(b.post.media)) fail(400, 'channel and post.media are required');
    for (const x of b.post.media) {
      if (!validKey(x.key) || !x.key.startsWith(`${b.slug}/`)) fail(400, `Bad media key ${x.key}`);
      const head = await media.head(x.key);
      if (!head || head.sha256 !== x.sha256) fail(400, `${x.key} is not uploaded with that sha256`);
    }
    return { ok: true, content_sha: await store.stage(caller.id, b.slug, b.channel as Channel, b.post) };
  }

  async function production(b: { items: { slug: string; script?: string; status: Production }[] }) {
    const known = await slugs();
    let saved = 0;
    for (const it of b.items ?? []) {
      if (!known.has(it.slug)) continue;
      await store.saveProduction(it.slug, (it.script ?? '').slice(0, 60000) || null, it.status ?? {});
      saved++;
    }
    return { ok: true, saved };
  }

  /** Dates set on the desk that differ from the build: the schedule job writes them into index.json. */
  async function schedule() {
    const built = new Map((await o.pieces()).map((a) => [a.slug, a.date]));
    return { changes: (await store.readSchedule()).filter((s) => built.has(s.slug) && built.get(s.slug) !== s.publish_date) };
  }

  async function openRequests() {
    const all = await store.readRequests();
    return { requests: all.filter((r) => !r.parent && r.status !== 'done').map((r) => ({ ...r, thread: all.filter((x) => x.parent === r.id) })) };
  }

  async function answerRequest(caller: Caller, b: { id: number; reply?: string; status?: string }) {
    const parent = (await store.readRequests()).find((r) => r.id === Number(b.id) && !r.parent);
    if (!parent) fail(404, 'No such request');
    if (b.reply) await store.addRequest(caller.id, parent!.slug, 'note', b.reply, parent!.id);
    if (b.status && ['open', 'working', 'done'].includes(b.status)) await store.setRequestStatus(caller.id, parent!.id, b.status);
    return { ok: true };
  }

  async function getMedia(key: string) {
    if (!validKey(key)) fail(400, 'Bad key');
    const obj = await media.get(key);
    if (!obj) fail(404, 'Not found');
    return new Response(obj!.body, { headers: { 'content-type': obj!.contentType ?? 'application/octet-stream', 'content-length': String(obj!.size), 'x-content-sha256': obj!.sha256 ?? '' } });
  }

  async function putMedia(caller: Caller, key: string, request: Request) {
    if (!validKey(key)) fail(400, 'Bad key: <slug>/<file>, lower-case');
    const want = (request.headers.get('x-content-sha256') ?? '').toLowerCase();
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX) fail(413, 'Too large');
    const got = await sha256(body);
    if (!want || got !== want) fail(400, `sha256 mismatch (got ${got})`);
    await media.put(key, body, { contentType: TYPES[key.split('.').pop() ?? ''] ?? 'application/octet-stream', sha256: got });
    await store.audit(caller.id, 'upload', key.split('/')[0], null, `${key} ${got.slice(0, 12)}`);
    return { ok: true, key, sha256: got, bytes: body.byteLength };
  }

  /** /m/<key>?exp=…&sig=…: one media file, public only with a valid, unexpired signature. The bucket stays private. */
  async function signedMedia(key: string, url: URL): Promise<Response> {
    const notFound = new Response('Not found', { status: 404 });
    if (!o.mediaSecret || !validKey(key)) return notFound;
    if (!(await checkSignature(key, url.searchParams.get('exp') ?? '', url.searchParams.get('sig') ?? '', o.mediaSecret))) return notFound;
    const obj = await media.get(key);
    if (!obj) return notFound;
    return new Response(obj.body, { headers: { 'content-type': obj.contentType ?? 'application/octet-stream', 'content-length': String(obj.size), 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });
  }

  /** The desk page's data: every piece in date order with each channel's state, production and requests. */
  async function plan() {
    const t = o.today(), all = await store.readAll(), prod = await store.readProduction(), requests = await store.readRequests();
    const pieces = await o.pieces(), dates = effectiveDates(pieces, all.schedule);
    const rows = pieces.map((a) => {
      const date = dates.get(a.slug)!;
      const channels = expected(a).map((c) => {
        const staged = all.staged.find((s) => s.slug === a.slug && s.channel === c);
        const posts = all.posts.filter((p) => p.slug === a.slug && p.channel === c);
        return {
          channel: c, state: channelState(staged, all.approvals.filter((x) => x.slug === a.slug && x.channel === c), posts),
          staged: staged ?? null, url: posts.filter((p) => p.status === 'posted').at(-1)?.url ?? null, last: posts.at(-1) ?? null,
        };
      });
      const p = prod.find((x) => x.slug === a.slug);
      return {
        ...a, date, built: a.date, moved: date !== a.date, live: a.date <= t, channels,
        script: p?.script ?? null, status: p?.status ?? {}, reported: p?.updated_at ?? null,
        requests: requests.filter((r) => r.slug === a.slug && !r.parent).map((r) => ({ ...r, thread: requests.filter((x) => x.parent === r.id) })),
      };
    }).sort((x, y) => x.date.localeCompare(y.date) || x.slug.localeCompare(y.slug));
    return { today: t, paused: all.paused, plan: rows, next: rows.find((r) => r.date >= t && r.channels.some((c) => c.state !== 'posted')) ?? null, audit: await store.recentAudit() };
  }

  /** What a person does on the desk page. Each returns { ok } or { error } with a status. */
  const desk = {
    plan,
    async approve(who: string, slug: string, items: string[]) {
      let n = 0;
      for (const item of items) { const [c, sha] = item.split(':'); if (isChannel(c) && (await store.approve(who, slug, c, sha))) n++; }
      return n === items.length ? { ok: `Approved ${n}` } : { status: 409, error: `Approved ${n} of ${items.length}: the rest changed since this page loaded. Reload and check again.` };
    },
    async revoke(who: string, slug: string, channel: string) {
      if (!isChannel(channel)) return { status: 400, error: 'Bad channel' };
      await store.revoke(who, slug, channel);
      return { ok: 'Approval withdrawn' };
    },
    async makeNext(who: string, slug: string) {
      const all = await store.readAll();
      const moved = makeNext(effectiveDates(await o.pieces(), all.schedule), slug, o.today());
      if (!moved.size) return { status: 400, error: 'That piece is already next, or already published.' };
      await store.setDates(who, moved, `make next: ${slug}`);
      return { ok: `Moved ${slug} to ${moved.get(slug)}; ${moved.size - 1} other piece(s) moved down one slot.` };
    },
    async request(who: string, slug: string, kind: string, body: string) {
      if (!(await slugs()).has(slug)) return { status: 400, error: 'No such piece' };
      if (!body.trim() && kind !== 'generate') return { status: 400, error: 'Say what to change' };
      await store.addRequest(who, slug, ['generate', 'edit', 'note'].includes(kind) ? kind : 'edit', body.trim() || 'Generate the motion for this piece from its script.');
      return { ok: 'Sent. Replies appear in the thread.' };
    },
    async reply(who: string, id: number, body: string, status?: string) {
      const parent = (await store.readRequests()).find((r) => r.id === id && !r.parent);
      if (!parent) return { status: 404, error: 'No such request' };
      if (body.trim()) await store.addRequest(who, parent.slug, 'note', body.trim(), id);
      if (status) await store.setRequestStatus(who, id, status);
      return { ok: 'Saved' };
    },
    async pause(who: string) { await store.setPaused(who, true); return { ok: 'Posting paused' }; },
    async resume(who: string) { await store.setPaused(who, false); return { ok: 'Posting resumed' }; },
  };

  return { api, signedMedia, desk, queue };
}
