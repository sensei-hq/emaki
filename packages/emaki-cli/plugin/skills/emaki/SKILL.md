---
name: emaki
description: >
  This skill should be used when the user asks to "build a learning portal", "build our story site", "set up motion
  stories", "build the site from the playbook", "create explainer stories with animations", "make an alert or awareness
  site with articles and videos", or hands over the emaki playbook and says "build". It runs the whole
  program: interview, outline, item cards, foundation, a pilot story, then automated batches of reader-friendly
  articles, presentation-ready story players and narrated videos from one set of JSON scenes, in every language.
metadata:
  version: "0.1.0"
---

# Motion stories: the program

Build a site of **stories**: each one an article for readers, a story player (slides) for presenting, and optionally
narrated videos, all rendered from one set of data files per story, in every configured language. The code is on npm under
`@senseihq`: `@senseihq/emaki` (framework-free core, web components, loaders, JSON Schemas), one wrapper per framework
(`@senseihq/emaki-svelte`, `-react`, `-vue`), `@senseihq/emaki-posting` (the posting desk) and `@senseihq/emaki-cli`
(the `emaki` command: init, validate, sheet, voice, fit, render, build). The plugin home (`.claude/emaki/`
after `emaki plugin install`, holding `PLAYBOOK.md`, `templates/`, `modules/`) carries the method. Read `PLAYBOOK.md`
once at the start of a program.

## Operating rules

- Work in phases with gates. Never start a phase before the previous gate is approved by the owner.
- Ask with AskUserQuestion (≤ 4 questions per call, recommended option first). Ask nothing the files answer.
- Keep a task list (TaskCreate/TaskUpdate) mirroring `project/tracker.md`, one task per gate and per item.
- Write decisions to `project/decisions.md` and requirements to `project/brief.md` as they are made.
- Show evidence at every gate: contact sheets (Read the image before sending), page screenshots, validation output.
- Content is data: fix text and scenes in the JSON, never by editing renders. Every claim needs a source.
- Secrets (TTS keys, platform tokens) live in environment variables only; never write, print or commit them.

## Phase 0 · Orient

1. Locate the plugin root and the target project folder (ask once if neither a repo nor an empty folder is obvious).
2. If `project/brief.md` exists, resume: read `project/tracker.md`, report where the program stands, continue.
3. Otherwise create `project/` from `templates/` (brief, decisions, outline, tracker, style-guide, changelog).

## Phase 1 · Interview and outline → Gate A

Follow `references/01-interview.md` rounds 1–3: purpose and audience, languages, stack and hosting, media scope;
brand and tone; source material and topics. Draft `project/outline.md` (site map + catalogue + pilot + batches)
and present it. Iterate until the owner approves. Record Gate A in the tracker.

## Phase 2 · Item cards (cover details)

For the pilot and the first batch, fill `templates/item-card.md` per item (`project/items/<slug>.md`) using the
`story-planner` agent for drafts: audience, objective, the one message, the punchline, 5–8 scenes with the picture
for each, facts with sources, CTA, voice draft. Confirm cards with the owner in batches of 3–5. Only approved cards
are built. Run the `fact-checker` agent over each card's claims before approval.

## Phase 3 · Foundation → Gate B

1. Scaffold the app in the chosen stack (or open the existing repo). Run `npx @senseihq/emaki-cli init` (it detects
   the framework, writes `emaki.config.json`, the film source and the `/show/[film]` capture route, and copies the
   sample content), then install the packages it names (`@senseihq/emaki` plus the framework's wrapper, and
   `@senseihq/emaki-cli` + `playwright` as dev dependencies).
2. Edit `content/` (the sample from `emaki init`: site.json with the owner's name, url, time zone, locales; the
   brand logo; ui strings per locale). Keep the sample story until the pilot replaces it.
3. Build the routes: `/[locale]/` (home), `/[locale]/stories` (index with topic filters and search),
   `/[locale]/stories/[slug]` (article: header, film player, sections with figures, takeaway band with sub,
   sources, related), `/show/[slug]` (player + capture contract). Server-render the text; hydrate the elements.
4. Apply the brand to `look.css` tokens and the site CSS. Verify in every launch locale at 375/768/1280 px and
   capture screenshots. Present them with the sample story's sheet. Gate B = the owner approves the look.

## Phase 4 · The pilot story → Gate C

Run the `story-build` skill for the pilot item end to end (story body, scenes, strings, sound, sheet, article page),
then `story-media` if video is in scope. Review against `references/07-quality-gates.md`, fix, then present: the
article page, the player link, the contact sheet per locale, and the video. Iterate with the feedback loop
(`references/08-feedback-loop.md`). On approval, write `project/style-guide.md` from what the pilot settled (layout
rules, motion grammar, tone, wording rules, punchline style). Gate C.

## Phase 5 · Batch build (automated)

For each approved item card, in batches of 3–5:
1. Dispatch one `scene-builder` agent per story (they can run in parallel) with the item card, the style guide, the
   pilot's scenes as examples, and `references/04-scene-authoring.md`; one `story-writer` agent for the story bodies
   and voice scripts.
2. When each returns: run `emaki validate <slug>` and `emaki sheet <slug>`; run the `visual-reviewer` agent
   on the sheet; apply its fixes; re-sheet.
3. Present the batch to the owner: per story one line, the sheet image, the page link. Collect change requests in the
   review sheet; apply them (`story-review` skill); repeat until approved. Update the tracker per story.

## Phase 6 · Languages

Once a story is approved in the default locale, run `story-localize` per additional locale (draft by the `localizer`
agent, native review, validate, sheet). Video per locale follows in Phase 7.

## Phase 7 · Media (if in scope)

Run `story-media` per story per locale: choose the voice provider per locale if not yet chosen (it asks: the
organisation's cloud platform, Piper or Kokoro offline, a premium service, or recorded), then voice → fit → render →
build → covers; review the delivery checklist.

## Phase 8 · Release → Gate E

Run the release checklist (07-quality-gates.md, Gate E). Deploy. If posting or a campaign is in scope, run
`story-publish`. Hand over: `project/` (brief, decisions, style guide, tracker, changelog), how to add a story
(`emaki new` + the per-item loop), and who approves what.

## Additional resources

- `PLAYBOOK.md`: the method for humans (roles, phases, gates, conventions, FAQ).
- `references/02-architecture.md`, `03-content-model.md`, `04-scene-authoring.md`, `05-voice-and-video.md`,
  `06-i18n.md`, `07-quality-gates.md`, `08-feedback-loop.md`, `09-publishing.md`.
- The package READMEs (`node_modules/@senseihq/*/README.md`), the sample content from `emaki init` (a complete bilingual example), `node_modules/@senseihq/emaki/schemas/`, `templates/`, `modules/`.
