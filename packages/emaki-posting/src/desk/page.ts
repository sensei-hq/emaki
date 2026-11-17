// What a person does on the desk page: its data (plan) and its actions. Each action returns { ok } or { error } with a
// status; the page calls them from its own form handlers.
import { channelState, isChannel, makeNext as moveToNext, effectiveDates, type Channel, type Production, type RequestRow } from '../rules.js';
import type { Piece } from '../api.js';
import type { DeskState } from '../store.js';
import { threaded, type DeskContext } from './context.js';

const REQUEST_KINDS = ['generate', 'edit', 'note'];

/** One channel of one piece on the desk page. */
function channelRow(all: DeskState, slug: string, c: Channel) {
  const staged = all.staged.find((s) => s.slug === slug && s.channel === c);
  const posts = all.posts.filter((p) => p.slug === slug && p.channel === c);
  return {
    channel: c, state: channelState(staged, all.approvals.filter((x) => x.slug === slug && x.channel === c), posts),
    staged: staged ?? null, url: posts.filter((p) => p.status === 'posted').at(-1)?.url ?? null, last: posts.at(-1) ?? null,
  };
}

type ProductionRow = { slug: string; script: string | null; status: Production; updated_at: string };
interface PlanInputs { t: string; all: DeskState; prod: ProductionRow[]; requests: RequestRow[]; dates: Map<string, string> }

/** One piece on the desk page: its date (as set and as built), each channel's state, its production and requests. */
function pieceRow(d: DeskContext, a: Piece, { t, all, prod, requests, dates }: PlanInputs) {
  const date = dates.get(a.slug)!;
  const channels = d.expected(a).map((c) => channelRow(all, a.slug, c));
  const p = prod.find((x) => x.slug === a.slug);
  return {
    ...a, date, built: a.date, moved: date !== a.date, live: a.date <= t, channels,
    script: p?.script ?? null, status: p?.status ?? {}, reported: p?.updated_at ?? null,
    requests: threaded(requests, (r) => r.slug === a.slug),
  };
}

/** The desk page's data: every piece in date order with each channel's state, production and requests. */
export async function plan(d: DeskContext) {
  const t = d.o.today(), all = await d.store.readAll(), prod = await d.store.readProduction(), requests = await d.store.readRequests();
  const pieces = await d.o.pieces(), dates = effectiveDates(pieces, all.schedule);
  const rows = pieces.map((a) => pieceRow(d, a, { t, all, prod, requests, dates }))
    .sort((x, y) => x.date.localeCompare(y.date) || x.slug.localeCompare(y.slug));
  return { today: t, paused: all.paused, plan: rows, next: rows.find((r) => r.date >= t && r.channels.some((c) => c.state !== 'posted')) ?? null, audit: await d.store.recentAudit() };
}

export async function approve(d: DeskContext, who: string, slug: string, items: string[]) {
  let n = 0;
  for (const item of items) { const [c, sha] = item.split(':'); if (isChannel(c) && (await d.store.approve(who, slug, c, sha))) n++; }
  return n === items.length ? { ok: `Approved ${n}` } : { status: 409, error: `Approved ${n} of ${items.length}: the rest changed since this page loaded. Reload and check again.` };
}

export async function revoke(d: DeskContext, who: string, slug: string, channel: string) {
  if (!isChannel(channel)) return { status: 400, error: 'Bad channel' };
  await d.store.revoke(who, slug, channel);
  return { ok: 'Approval withdrawn' };
}

export async function makeNext(d: DeskContext, who: string, slug: string) {
  const all = await d.store.readAll();
  const moved = moveToNext(effectiveDates(await d.o.pieces(), all.schedule), slug, d.o.today());
  if (!moved.size) return { status: 400, error: 'That piece is already next, or already published.' };
  await d.store.setDates(who, moved, `make next: ${slug}`);
  return { ok: `Moved ${slug} to ${moved.get(slug)}; ${moved.size - 1} other piece(s) moved down one slot.` };
}

export async function request(d: DeskContext, who: string, slug: string, kind: string, body: string) {
  if (!(await d.slugs()).has(slug)) return { status: 400, error: 'No such piece' };
  if (!body.trim() && kind !== 'generate') return { status: 400, error: 'Say what to change' };
  await d.store.addRequest(who, slug, REQUEST_KINDS.includes(kind) ? kind : 'edit', body.trim() || 'Generate the motion for this piece from its script.');
  return { ok: 'Sent. Replies appear in the thread.' };
}

export async function reply(d: DeskContext, who: string, id: number, body: string, status?: string) {
  const parent = (await d.store.readRequests()).find((r) => r.id === id && !r.parent);
  if (!parent) return { status: 404, error: 'No such request' };
  if (body.trim()) await d.store.addRequest(who, parent.slug, 'note', body.trim(), id);
  if (status) await d.store.setRequestStatus(who, id, status);
  return { ok: 'Saved' };
}

export async function pause(d: DeskContext, who: string) { await d.store.setPaused(who, true); return { ok: 'Posting paused' }; }
export async function resume(d: DeskContext, who: string) { await d.store.setPaused(who, false); return { ok: 'Posting resumed' }; }

/** The desk page's data and actions, bound to one desk. Methods (not function properties), as the API has always typed them. */
export interface DeskActions {
  plan: () => ReturnType<typeof plan>;
  approve(who: string, slug: string, items: string[]): ReturnType<typeof approve>;
  revoke(who: string, slug: string, channel: string): ReturnType<typeof revoke>;
  makeNext(who: string, slug: string): ReturnType<typeof makeNext>;
  request(who: string, slug: string, kind: string, body: string): ReturnType<typeof request>;
  reply(who: string, id: number, body: string, status?: string): ReturnType<typeof reply>;
  pause(who: string): ReturnType<typeof pause>;
  resume(who: string): ReturnType<typeof resume>;
}
