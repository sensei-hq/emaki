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
4. **Campaign** (only if in scope): follow `modules/campaign/README.md`: plan the calendar with the owner, write day
   scripts in batches for approval, build each day's story with `story-build` (shorts) and `story-media`, stage for
   approval.
5. Record what was released in `project/changelog.md` and hand over the runbook (how to add a story, approve, post).
