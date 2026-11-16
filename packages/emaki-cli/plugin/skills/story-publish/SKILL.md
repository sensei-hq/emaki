---
name: story-publish
description: >
  This skill should be used when the user asks to "publish", "release the site", "set up posting", "schedule the
  stories", "set up the posting desk", "plan a campaign", or "post the videos". It runs the release checklist, deploys,
  and sets up the optional posting desk and daily campaign modules.
metadata:
  version: "0.1.0"
---

# Release and distribution

1. **Release checklist** (`skills/emaki/references/07-quality-gates.md`, Gate E): build, prerender per
   locale, hreflang, sitemap, og images, accessibility, performance. Fix before deploying.
2. **Daily rebuild**: a scheduled build so date-gated stories publish on their day in the site's time zone.
3. **Posting desk** (only if in scope): follow `modules/posting-desk/README.md`. Ask which identity proxy, database,
   object storage and scheduler the organisation uses; port the reference logic; set it up paused, dry-run,
   YouTube private; test the approval-voids-on-change path; go live one channel at a time with the owner.
   From the producing machine: `emaki stage <slug> --dry-run` (read the posts), then `emaki stage <slug>` (uploads
   the media with its sha256 and stages each channel; a film's text is drafted into
   `content/films/<slug>/post.<locale>.json` on the first run: have the owner read it, then stage again);
   `emaki stage status` keeps the desk's plan current; `emaki stage requests` and
   `emaki stage reply <id> "…" --working|--done` answer the owner's motion requests.
4. **Straight to a platform** (no desk; only when the owner asks): `emaki publish youtube|instagram --verify` (names
   the account), `emaki publish <channel> <slug> --dry-run`, show the owner the output, then run it without
   `--dry-run`. YouTube stays `--privacy unlisted` until the owner says public; a film already on YouTube is refreshed
   with `--update <id>`, never uploaded twice. The link goes into `content/stories/index.json`.
5. **Campaign** (only if in scope): follow `modules/campaign/README.md`: plan the calendar with the owner, write day
   scripts in batches for approval, `emaki campaign shortfilm <slug>` for each day's Short, build it with
   `story-build` and `story-media` (`--o portrait`), `emaki carousel <slug>`, then `emaki stage <slug>`.
   `emaki campaign status` shows what each day still needs; `emaki campaign posted <slug> --youtube … --x …` records
   links posted by hand.
6. Keys: never ask for, print or store one. Name the environment variable that is missing (`STAGER_CLIENT_ID`,
   `STAGER_CLIENT_SECRET`, `MEDIA_URL_SECRET`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`, `IG_USER_ID`,
   `IG_ACCESS_TOKEN`) and stop until the owner has set it.
7. Record what was released in `project/changelog.md` and hand over the runbook (how to add a story, approve, post).
