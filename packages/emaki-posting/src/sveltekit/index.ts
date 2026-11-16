// SvelteKit glue: a hook that guards the admin paths with Cloudflare Access and the role rules, and route handlers
// for the API and the signed media links. Typed structurally, so this does not import @sveltejs/kit.
//
//   // src/hooks.server.ts
//   import { postingHandle } from '@senseihq/emaki-posting/sveltekit';
//   import { env } from '$env/dynamic/private'; import { dev } from '$app/environment';
//   export const handle = postingHandle({ env: () => env, dev });
//
//   // src/routes/api/admin/[...path]/+server.ts           // src/routes/m/[...key]/+server.ts
//   export const { GET, POST, PUT } = apiRoutes(desk);       export const { GET } = mediaRoute(desk);
//   (desk = (event) => createDesk({ store: d1Store(event.platform.env.DB), media: r2Media(event.platform.env.MEDIA), ... }))
import { accessFromEnv, allowed, callerOf, isAdminPath, paths, type Caller } from '../access.js';
import type { createDesk } from '../api.js';

type Desk = ReturnType<typeof createDesk>;
interface Event { request: Request; url: URL; params: Record<string, string | undefined>; locals: Record<string, unknown>; platform?: unknown }
type Resolve = (event: never) => Response | Promise<Response>;

export interface HandleOptions {
  /** Private env (CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, ADMIN_EMAILS, STAGER_CLIENT_IDS, POSTER_CLIENT_IDS). */
  env: () => Record<string, string | undefined>;
  /** Let a local admin in when Access is not configured (pass SvelteKit's `dev`). */
  dev?: boolean;
}

/** Guards the admin pages and API: a valid Access token whose role may use the path, else 403. Sets locals.caller. */
export function postingHandle(o: HandleOptions) {
  return async ({ event, resolve }: { event: Event; resolve: Resolve }) => {
    const path = event.url.pathname;
    if (!isAdminPath(path)) return resolve(event as never);
    const caller = await callerOf(event.request, accessFromEnv(o.env()), { dev: o.dev });
    if (!caller || !allowed(caller.role, path, event.request.method)) {
      return path.startsWith(paths.api + '/')
        ? new Response(JSON.stringify({ ok: false, reason: 'Not allowed' }), { status: 403, headers: { 'content-type': 'application/json' } })
        : new Response('Not allowed', { status: 403 });
    }
    event.locals.caller = caller;
    const res = await resolve(event as never);
    res.headers.set('cache-control', 'no-store');
    res.headers.set('x-robots-tag', 'noindex');
    return res;
  };
}

/** GET/POST/PUT for src/routes/<api>/[...path]/+server.ts. `desk` builds the desk for this request (bindings live on
 *  event.platform). */
export function apiRoutes(desk: (event: Event) => Desk | Promise<Desk>) {
  const h = async (event: Event) => {
    const caller = event.locals.caller as Caller | undefined;
    if (!caller) return new Response('Not allowed', { status: 403 });
    return (await desk(event)).api(event.request, caller, event.params.path ?? '');
  };
  return { GET: h, POST: h, PUT: h };
}

/** GET for src/routes/m/[...key]/+server.ts: the signed, short-lived public media links. */
export function mediaRoute(desk: (event: Event) => Desk | Promise<Desk>) {
  return { GET: async (event: Event) => (await desk(event)).signedMedia(event.params.key ?? '', event.url) };
}
