# Interview: from "build it" to an approved outline

Run the interview with AskUserQuestion, at most four questions per call, options first and a recommended default
marked "(Recommended)". Never ask what the files already answer: read `project/brief.md`, existing content and
any brand material the user attaches first. Record every answer in `project/brief.md` and every choice that would be
expensive to undo in `project/decisions.md`.

## Round 1 · The site (one call)

1. **Purpose and audience.** Learning portal (staff, partners, customers), marketing or awareness site, product
   explainers, onboarding. Who reads it, on what device, how they arrive (email, social, search, LMS link).
2. **Languages.** Which locales at launch, which later, the default, any right-to-left language, who translates
   (Claude drafts + human review is the default), whether the voiceover is localised or only captions.
3. **Stack.** React/Next.js, Svelte/SvelteKit, Vue/Nuxt, Astro, or "pick for us" (recommend the team's existing
   stack; otherwise SvelteKit or Astro with static prerendering). Hosting (static host, Vercel, Netlify, Cloudflare,
   internal). Existing repo or new.
4. **Media.** Stories with motion only, or also narrated videos (16:9 for the site/YouTube, 9:16 for Shorts/Reels),
   and whether social posting is in scope (posting desk, daily campaign modules).

When narrated video is in scope, ask a follow-up about the **voice** (one question, options from
`05-voice-and-video.md`): "Which voice engine should we use?" with options *Your organisation's cloud platform
(Recommended if you have Azure, Google Cloud or AWS)*, *Piper: free and offline (Recommended otherwise)*, *A premium
service (ElevenLabs or OpenAI)*, *Recorded by a person*. Then per locale pick a voice (`emaki voices`), record it
with `emaki set-voice`, and make a 10-second sample take for the owner to approve with the pilot. Ask the owner to
set any key as an environment variable themselves; never ask for a key in chat.

## Round 2 · Brand and look (one call, plus attachments)

Ask for the logo (SVG), colours, fonts, an existing site or deck to match, and two or three references they like.
If none: propose the kit's default look (washi paper, ink, one accent, dot-grid board, Fraunces + Inter) re-coloured
to their accent, and show it on the pilot. Confirm tone of voice (plain and direct by default), reading level, and
any words or claims to avoid (legal, regulated topics).

## Round 3 · The catalogue (one call, then a document)

Ask for the source material (policies, decks, docs, transcripts, SME notes, URLs) and the list of topics, or offer
to propose topics from the material. Then draft `project/outline.md` from `templates/outline.md`:

- the site map (home, story index with filters by topic, story pages per locale, the player, about/contact);
- the **catalogue**: one row per item with slug, working title, format (film 60–90 s · short 30–60 s · article only),
  topic, priority, target date, source documents, owner/SME;
- the order of work: the **pilot** first (an item that exercises the most scene types), then batches.

Present the outline (a table in chat plus the file), ask for approval or edits, and do not build anything until it
is approved. Re-ask only for what changed.

## Round 4 · Cover details per item (batched)

For each item, fill an **item card** (`templates/item-card.md`) and confirm it with the owner in batches of 3–5:

- **Audience and objective:** who, and what they should know, feel or do afterwards (one sentence each).
- **The one message** and the **punchline** (the closing line, 3–9 words; it becomes the cover, the takeaway band
  and the last voice line).
- **Scenes:** 5–8 for a film (hook → problem/why → 2–4 idea scenes → how/what to do → close), 4–6 for a short. For
  each: id, the one point it makes, the picture that makes it (cards, chart, flow, before/after, list), and the
  section of the article it illustrates.
- **Facts and sources:** every number, name and claim with its source; mark illustrative data as such on screen.
- **Call to action** and links; what must not be said.
- **Voice:** the script draft (150 words a minute; 10–30 words per scene).

An item card is "ready" when the owner has approved it. Only ready cards go to the build.

## Questions to ask only when relevant

- Accessibility level (WCAG 2.2 AA default), captions on all video (default yes), reduced-motion behaviour.
- Analytics and consent; SEO (per-locale URLs and hreflang default yes); LMS packaging (SCORM/xAPI wrappers).
- Review roles: who approves content, who approves look, who signs off translations; turnaround expected.
- For alerts/advisories: severity labels, update cadence, expiry of a story, "last reviewed" dates.
