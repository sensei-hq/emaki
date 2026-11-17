# Posting desk (optional module)

A private admin where a person sees the publishing plan, previews each story before it goes live, reorders what
comes next, asks for changes, and **approves** posts; a scheduled job then posts the approved, unchanged media to
YouTube, Instagram and X. Nothing is posted that a person did not approve, and an approval is void the moment the
media or text changes.

The implementation is the npm package `@senseihq/emaki-posting`: framework-free rules and a Web `Request → Response`
API (`createDesk`), a store interface with an in-memory store, a Cloudflare adapter (`/cloudflare`: D1 + R2) and a
SvelteKit adapter (`/sveltekit`: the guard hook and route handlers), the D1 migrations, and the CI poster scripts
(`poster/`). Other stacks implement `PostingStore` + `MediaStore` and mount `desk.api` on any fetch-style server.

## The model

| Piece | What it does | Reference |
|---|---|---|
| Identity at the edge | Every `/admin`, `/api/admin`, preview URL sits behind an identity proxy (Cloudflare Access, Google IAP, Azure AD App Proxy, oauth2-proxy). The app **re-verifies** the signed identity header (signature, audience, issuer, expiry, key id) and fails closed. | `verifyCaller`, `callerOf`; `/sveltekit` `postingHandle` |
| Roles | `admin` (people, by email), `stager` (the production machine's service token: uploads media and text), `poster` (the scheduled job's service token: reads the queue, records results). A matrix allows each role only its routes and methods. | `allowed` |
| Staging | The production machine uploads each post's media (sha256 checked) and text per channel: `emaki stage <slug>`. | `desk.api` → `stage`, `media/<key>` (PUT) |
| Approval bound to content | An approval stores the sha256 of the canonical post (channel + text + media hashes). Restaging anything changes the hash, so the approval no longer matches. | `contentSha`, `PostingStore.approve` |
| The queue | A post is due only when the story's publish date has passed in the site's time zone, it is approved, the hash still matches, and posting isn't paused (it starts paused). | `due`, `desk.api` → `queue` |
| Media to platforms | Platforms fetch media by URL: short-lived signed URLs (HMAC, one hour) on a public route that serves nothing else. | `signMedia`, `desk.signedMedia`; `/sveltekit` `mediaRoute` |
| The poster | A scheduled job (GitHub Actions in a protected environment holding the platform keys) reads the queue, re-checks each file's hash, posts, and records the link. `POST_MODE=dry-run` until you trust it; YouTube starts `private`. | `poster/post.py` (see the package README for the workflow) |
| Planning | Make next (pull a story forward; the rest shift a slot), production status from the production machine (`emaki stage status`), and a request thread per story ("ask for a change"), which the producer answers (`emaki stage requests`, `emaki stage reply`). | `desk.desk` (`plan`, `makeNext`, `request`, `reply`) |
| Audit | Every approve, revoke, pause, post and failure is logged with who and when. | `migrations/0001_posting.sql`, `desk.desk.plan().audit` |

## Setup checklist (adapt to your stack)

1. A database with the tables in `node_modules/@senseihq/emaki-posting/migrations/` and object storage for media.
2. The identity proxy in front of the admin paths, with your people allowed; two service tokens (stager, poster).
3. App secrets: the proxy's audience and team domain, `ADMIN_EMAILS`, the two service token ids, `MEDIA_URL_SECRET`.
4. The poster's environment: platform credentials (YouTube OAuth refresh token, Instagram Graph token and account id,
   X OAuth 1.0a keys), `POST_MODE=dry-run`, `YT_PRIVACY=private`. Keys live only there, never in the repo.
5. Test end to end in dry-run: stage → approve → (change the text: approval voids) → re-approve → dry-run post.
6. Turn on live posting one channel at a time.

The package README has the step-by-step guide for the Cloudflare + SvelteKit + GitHub Actions version.
