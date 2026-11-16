# Inspect, give feedback, correct

The owner and reviewers should never have to describe a fix twice. Make feedback precise, track it, and show the
result next to the request.

## How reviewers see the work

- **Review page**: `/review/<slug>` (or the admin preview) shows the article, the player, and the latest contact
  sheet per locale, with the item card beside it. Without a review route, send the sheet image and the page
  screenshot in chat, plus the dev URL.
- **Review sheet** (`templates/review-sheet.md`) per story: one row per scene × locale, columns for content,
  look, motion, text; each reviewer marks ✓ or writes a change request.

## Change requests

Write each request as `templates/change-request.md`: story, scene, locale, orientation, time (or "final frame"),
what is wrong, what it should be, severity (blocker / should / nice). Claude restates ambiguous requests in one
line before changing anything when the fix could go two ways; otherwise it just fixes.

## Applying fixes

1. Group requests by story; fix the data (strings, scene JSON, story body), never by patching a render.
2. Re-run `validate`, re-make the sheet (only the affected scenes with `--at`), and look at it.
3. Reply per request with the before/after frames and one line on what changed. Mark it done in the review sheet.
4. When a fix generalises (a spacing rule, a colour use, a wording rule), add it to `project/style-guide.md` and apply
   it to the other stories in the next batch.
5. Text changes after voice was recorded mean re-recording that take: say so and list the takes affected.

## Versioning

Commit content changes in small, named commits (`story(<slug>): …`). Tag a story's approved state
(`<slug>@approved-<date>`). `project/changelog.md` lists what changed per story and why.
