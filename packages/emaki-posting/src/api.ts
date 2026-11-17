// The desk's HTTP API as plain Web Request → Response, so it runs in any server that speaks fetch (SvelteKit, a
// Cloudflare Worker, Hono, Next.js route handlers, Bun, Deno). Machines use it: the producing machine stages posts and
// uploads media; the CI poster reads the approved queue and reports outcomes. People use the desk page, which calls
// the `desk` actions below from its own form handlers. The handlers live in ./desk/machine.ts and ./desk/page.ts.
import { CHANNELS, type Channel } from './rules.js';
import type { Caller } from './access.js';
import type { MediaStore, PostingStore } from './store.js';
import type { DeskContext } from './desk/context.js';
import { HttpError, json, refusal } from './desk/http.js';
import * as machine from './desk/machine.js';
import * as page from './desk/page.js';

export { HttpError };

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

/** A route of the API under the admin prefix. `rest` is the path after the route's prefix (for media: the key). */
interface Route {
  method: string;
  /** The exact path after the admin prefix ('queue'), or a prefix when it ends in '/' ('media/'). */
  path: string;
  handle: (d: DeskContext, request: Request, caller: Caller, rest: string) => Promise<Response>;
}

const answer = async (data: Promise<unknown>) => json(await data);
// The body is parsed only once the route is known, so an unknown route never reads it.
const body = <T>(request: Request) => request.json() as Promise<T>;

const ROUTES: Route[] = [
  { method: 'GET', path: 'queue', handle: (d, r) => answer(machine.queue(d, new URL(r.url).origin)) },
  { method: 'POST', path: 'posted', handle: async (d, r, c) => answer(machine.posted(d, c, await body(r))) },
  { method: 'POST', path: 'stage', handle: async (d, r, c) => answer(machine.stage(d, c, await body(r))) },
  { method: 'POST', path: 'production', handle: async (d, r) => answer(machine.production(d, await body(r))) },
  { method: 'GET', path: 'schedule', handle: (d) => answer(machine.schedule(d)) },
  { method: 'GET', path: 'requests', handle: (d) => answer(machine.openRequests(d)) },
  { method: 'POST', path: 'requests', handle: async (d, r, c) => answer(machine.answerRequest(d, c, await body(r))) },
  { method: 'GET', path: 'media/', handle: (d, _r, _c, key) => machine.getMedia(d, key) },
  { method: 'PUT', path: 'media/', handle: (d, r, c, key) => answer(machine.putMedia(d, c, key, r)) },
];

const isPrefix = (route: Route) => route.path.endsWith('/');
const matches = (route: Route, method: string, sub: string) =>
  route.method === method && (isPrefix(route) ? sub.startsWith(route.path) : sub === route.path);
const restOf = (route: Route, sub: string) => (isPrefix(route) ? sub.slice(route.path.length) : '');

/** The API under the admin prefix: `sub` is the path after it ('queue', 'media/<slug>/<file>', ...). */
async function api(d: DeskContext, request: Request, caller: Caller, sub: string): Promise<Response> {
  const route = ROUTES.find((r) => matches(r, request.method, sub));
  try {
    return route ? await route.handle(d, request, caller, restOf(route, sub)) : refusal(404, 'Not found');
  } catch (e) {
    if (e instanceof HttpError) return refusal(e.status, e.message);
    throw e;
  }
}

const defaultChannels = (p: Piece): Channel[] => (p.video === 'short' ? [...CHANNELS] : ['youtube', 'instagram_reel', 'x']);

export function createDesk(o: DeskOptions) {
  const d: DeskContext = {
    o, store: o.store, media: o.media, expected: o.channelsFor ?? defaultChannels,
    slugs: async () => new Set((await o.pieces()).map((p) => p.slug)),
  };

  /** What a person does on the desk page. Each returns { ok } or { error } with a status. */
  const desk: page.DeskActions = {
    plan: () => page.plan(d),
    approve: (who: string, slug: string, items: string[]) => page.approve(d, who, slug, items),
    revoke: (who: string, slug: string, channel: string) => page.revoke(d, who, slug, channel),
    makeNext: (who: string, slug: string) => page.makeNext(d, who, slug),
    request: (who: string, slug: string, kind: string, body: string) => page.request(d, who, slug, kind, body),
    reply: (who: string, id: number, body: string, status?: string) => page.reply(d, who, id, body, status),
    pause: (who: string) => page.pause(d, who),
    resume: (who: string) => page.resume(d, who),
  };

  return {
    api: (request: Request, caller: Caller, sub: string) => api(d, request, caller, sub),
    signedMedia: (key: string, url: URL) => machine.signedMedia(d, key, url),
    desk,
    queue: (origin: string) => machine.queue(d, origin),
  };
}
