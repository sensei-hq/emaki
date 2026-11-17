// The handlers behind the machines' API: the producing machine stages posts and uploads media; the CI poster reads
// the approved queue and reports outcomes. Each takes the desk's context first; the router in ../api.ts picks one.
import { checkSignature, due, isChannel, sha256, signMedia, validKey, type Channel, type MediaRef, type Production, type StagedPost, type StagedRow } from '../rules.js';
import type { Caller } from '../access.js';
import type { Piece } from '../api.js';
import type { DeskState, MediaObject } from '../store.js';
import { threaded, type DeskContext } from './context.js';
import { fail } from './http.js';

const TYPES: Record<string, string> = { mp4: 'video/mp4', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', srt: 'text/plain; charset=utf-8', vtt: 'text/vtt' };
const MAX = 95 * 1024 * 1024; // under the Workers request-body limit
const OUTCOMES = ['posted', 'dry-run', 'failed'];
const REQUEST_STATES = ['open', 'working', 'done'];

/** Each piece with what the desk holds for it, as due() reads it. */
function queueRows(all: DeskState, pieces: Piece[]) {
  const planned = new Map(all.schedule.map((s) => [s.slug, s.publish_date]));
  return pieces.map((a) => ({
    slug: a.slug, date: a.date, planned: planned.get(a.slug),
    staged: all.staged.filter((s) => s.slug === a.slug), approvals: all.approvals.filter((x) => x.slug === a.slug), posts: all.posts.filter((p) => p.slug === a.slug),
  }));
}

/** A media file of a due post, with a short-lived public link when the desk has a media secret. */
const linked = async (d: DeskContext, x: MediaRef, base: string) =>
  ({ ...x, url: d.o.mediaSecret ? await signMedia(x.key, d.o.mediaSecret, base, 3600, Date.now(), d.o.mediaPath ?? '/m') : null });

const queueItem = async (d: DeskContext, s: StagedRow, pieces: Piece[], base: string) => ({
  slug: s.slug, channel: s.channel, content_sha: s.content_sha, post: s.post, article: d.o.pieceUrl(s.slug),
  video: pieces.find((a) => a.slug === s.slug)?.video ?? 'short',
  media: await Promise.all(s.post.media.map((x) => linked(d, x, base))),
});

/** What is approved and due now, with short-lived media links. Empty while posting is paused. */
export async function queue(d: DeskContext, origin: string) {
  const all = await d.store.readAll(), t = d.o.today();
  const pieces = await d.o.pieces();
  const rows = queueRows(all, pieces);
  const base = d.o.mediaOrigin || origin;
  return { paused: all.paused, today: t, items: await Promise.all(due(rows, t, all.paused).map((s) => queueItem(d, s, pieces, base))) };
}

const validOutcome = (b: Record<string, string>) => Boolean(b.slug && isChannel(b.channel) && b.content_sha && OUTCOMES.includes(b.status));

export async function posted(d: DeskContext, caller: Caller, b: Record<string, string>) {
  if (!validOutcome(b)) fail(400, 'slug, channel, content_sha and status are required');
  await d.store.recordPost(caller.id, { slug: b.slug, channel: b.channel as Channel, content_sha: b.content_sha, status: b.status as 'posted', url: b.url, external_id: b.external_id, detail: b.detail?.slice(0, 2000), run: b.run });
  return { ok: true };
}

/** One staged media file must sit under the piece and be uploaded with the same sha256. */
async function checkStagedMedia(d: DeskContext, slug: string, x: MediaRef) {
  if (!validKey(x.key) || !x.key.startsWith(`${slug}/`)) fail(400, `Bad media key ${x.key}`);
  const head = await d.media.head(x.key);
  if (!head || head.sha256 !== x.sha256) fail(400, `${x.key} is not uploaded with that sha256`);
}

const validStaging = (b: { channel: string; post: StagedPost }) => isChannel(b.channel) && Boolean(b.post) && Array.isArray(b.post.media);

/** The post for one piece and channel, as it will go out. Every media file must already be uploaded, same sha256. */
export async function stage(d: DeskContext, caller: Caller, b: { slug: string; channel: string; post: StagedPost }) {
  if (!(await d.slugs()).has(b.slug)) fail(400, `No piece "${b.slug}" in the index`);
  if (!validStaging(b)) fail(400, 'channel and post.media are required');
  for (const x of b.post.media) await checkStagedMedia(d, b.slug, x);
  return { ok: true, content_sha: await d.store.stage(caller.id, b.slug, b.channel as Channel, b.post) };
}

export async function production(d: DeskContext, b: { items: { slug: string; script?: string; status: Production }[] }) {
  const known = await d.slugs();
  const items = (b.items ?? []).filter((it) => known.has(it.slug));
  for (const it of items) await d.store.saveProduction(it.slug, (it.script ?? '').slice(0, 60000) || null, it.status ?? {});
  return { ok: true, saved: items.length };
}

/** Dates set on the desk that differ from the build: the schedule job writes them into index.json. */
export async function schedule(d: DeskContext) {
  const built = new Map((await d.o.pieces()).map((a) => [a.slug, a.date]));
  return { changes: (await d.store.readSchedule()).filter((s) => built.has(s.slug) && built.get(s.slug) !== s.publish_date) };
}

export async function openRequests(d: DeskContext) {
  return { requests: threaded(await d.store.readRequests(), (r) => r.status !== 'done') };
}

export async function answerRequest(d: DeskContext, caller: Caller, b: { id: number; reply?: string; status?: string }) {
  const parent = (await d.store.readRequests()).find((r) => r.id === Number(b.id) && !r.parent);
  if (!parent) fail(404, 'No such request');
  if (b.reply) await d.store.addRequest(caller.id, parent!.slug, 'note', b.reply, parent!.id);
  if (b.status && REQUEST_STATES.includes(b.status)) await d.store.setRequestStatus(caller.id, parent!.id, b.status);
  return { ok: true };
}

const contentType = (obj: MediaObject) => obj.contentType ?? 'application/octet-stream';

export async function getMedia(d: DeskContext, key: string) {
  if (!validKey(key)) fail(400, 'Bad key');
  const obj = await d.media.get(key);
  if (!obj) fail(404, 'Not found');
  return new Response(obj!.body, { headers: { 'content-type': contentType(obj!), 'content-length': String(obj!.size), 'x-content-sha256': obj!.sha256 ?? '' } });
}

export async function putMedia(d: DeskContext, caller: Caller, key: string, request: Request) {
  if (!validKey(key)) fail(400, 'Bad key: <slug>/<file>, lower-case');
  const want = (request.headers.get('x-content-sha256') ?? '').toLowerCase();
  const body = await request.arrayBuffer();
  if (body.byteLength > MAX) fail(413, 'Too large');
  const got = await sha256(body);
  if (!want || got !== want) fail(400, `sha256 mismatch (got ${got})`);
  await d.media.put(key, body, { contentType: TYPES[key.split('.').pop()!] ?? 'application/octet-stream', sha256: got });
  await d.store.audit(caller.id, 'upload', key.split('/')[0], null, `${key} ${got.slice(0, 12)}`);
  return { ok: true, key, sha256: got, bytes: body.byteLength };
}

/** A signed link is good only with a media secret, a valid key and an unexpired signature, checked in that order. */
const validLink = async (d: DeskContext, key: string, url: URL) =>
  Boolean(d.o.mediaSecret) && validKey(key) && checkSignature(key, url.searchParams.get('exp') ?? '', url.searchParams.get('sig') ?? '', d.o.mediaSecret!);

/** /m/<key>?exp=…&sig=…: one media file, public only with a valid, unexpired signature. The bucket stays private. */
export async function signedMedia(d: DeskContext, key: string, url: URL): Promise<Response> {
  const obj = (await validLink(d, key, url)) ? await d.media.get(key) : null;
  if (!obj) return new Response('Not found', { status: 404 });
  return new Response(obj.body, { headers: { 'content-type': contentType(obj), 'content-length': String(obj.size), 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' } });
}
