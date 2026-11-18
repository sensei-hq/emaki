# @senseihq/emaki-posting

The posting desk: the machine that renders a story **stages** each post (media + text per channel); a person
**approves** exactly what was staged; a CI job **posts** what is approved once the story's date comes. An approval
holds the fingerprint (sha256) of the post it was given for, so restaging anything voids it. Posting starts paused.

```sh
npm i @senseihq/emaki-posting
```

| Export | What |
|---|---|
| `@senseihq/emaki-posting` | rules (`contentSha`, `channelState`, `due`, `makeNext`, `signMedia`, `checkSignature`, `validKey`), access (`verifyCaller`, `callerOf`, `allowed`, roles admin / stager / poster), `PostingStore` + `MediaStore` interfaces and `memoryStore()`, and `createDesk(options)` → `{ api, signedMedia, desk }` |
| `/cloudflare` | `d1Store(db)` and `r2Media(bucket)` |
| `/sveltekit` | `postingHandle({ env, dev })` (the guard hook), `apiRoutes(desk)`, `mediaRoute(desk)` |
| `/migrations/*` | D1 / SQLite schema: staged, approvals, posts, audit, settings, schedule, production, requests |
| `poster/` | `post.py` (YouTube, Instagram, X; dry-run by default) and `sync_schedule.py`, for CI |

`desk.api(request, caller, path)` is a Web `Request → Response` handler, so it mounts on any fetch-style server
(SvelteKit, Workers, Hono, Next.js route handlers, Bun, Deno). `desk.desk` holds what a person does on the desk page:
`plan()`, `approve`, `revoke`, `makeNext`, `request`, `reply`, `pause`, `resume`.

## SvelteKit on Cloudflare

```ts
// src/lib/server/desk.ts
import { createDesk } from '@senseihq/emaki-posting';
import { d1Store, r2Media } from '@senseihq/emaki-posting/cloudflare';
export const desk = (e) => createDesk({
  store: d1Store(e.platform.env.DB), media: r2Media(e.platform.env.MEDIA),
  pieces: () => STORIES.map((s) => ({ slug: s.slug, date: s.publish_date, video: s.kind })),
  today: () => today(SITE.timeZone), pieceUrl: (slug) => `${SITE.url}/stories/${slug}`,
  mediaSecret: e.platform.env.MEDIA_URL_SECRET,
});
// src/hooks.server.ts
export const handle = postingHandle({ env: () => env, dev });
// src/routes/api/admin/[...path]/+server.ts
export const { GET, POST, PUT } = apiRoutes(desk);
// src/routes/m/[...key]/+server.ts
export const { GET } = mediaRoute(desk);
```

Setup:

1. `wrangler d1 create`, bind it as `DB`; apply `migrations/0001_posting.sql` and `0002_planning.sql`. Create a
   private R2 bucket bound as `MEDIA`.
2. Put a Cloudflare Access application in front of `/admin` and `/api/admin`, allowing your people; create two
   service tokens (stager, poster).
3. Secrets (never in files): `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `ADMIN_EMAILS`, `STAGER_CLIENT_IDS`,
   `POSTER_CLIENT_IDS`, `MEDIA_URL_SECRET`.
4. CI (GitHub Actions in a protected environment): `ADMIN_ORIGIN`, `POSTER_CLIENT_ID/SECRET`, the platform keys,
   `POST_MODE=dry-run` until you trust it; run `python3 node_modules/@senseihq/emaki-posting/poster/post.py`.
5. Test in dry-run: stage → approve → change the text (the approval lapses) → re-approve → dry-run post.

MIT © sensei-hq
