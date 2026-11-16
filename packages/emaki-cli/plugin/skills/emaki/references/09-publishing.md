# Publishing, posting and campaigns

- **Site**: prerender every published story per locale; rebuild daily (a scheduled build) so date-gated stories go
  live on their day in the site's time zone. Drafts are visible only in preview/admin.
- **Posting desk** (`modules/posting-desk/`): private admin with preview, reorder ("make next"), change requests and
  approval bound to a content hash; a scheduled poster publishes approved media to YouTube, Instagram and X. Start
  paused, dry-run, YouTube private.
- **Campaign** (`modules/campaign/`): a calendar of daily shorts with a day script per day (voice table + channel copy),
  built with the same per-item loop.
- **Analytics**: per story and locale: views, read depth, player starts, sound-on rate, video completion; feed the
  numbers into the next batch's priorities.
