# Motion Stories Playbook

How to build a site of **stories**, each one a reader-friendly article, a presentation-ready story player and
(optionally) narrated videos, all from one set of data files, in every language you need. Written for the team
that owns the site (L&D, communications, a product or alert team) and for Claude, who builds it with you.

---

## 1 · What you get

| Output | For | Notes |
|---|---|---|
| **Story pages** | Readers on any device; search | Text first; each section illustrated by a looping animated figure; a "short version" band at the end. |
| **Story player** | Presenters, kiosks, the top of each story | The story's scenes as slides, 16:9 or 9:16, with optional sound; full screen with ←/→. |
| **Videos** | YouTube, Shorts/Reels, your LMS | The player recorded frame by frame with voiceover, sound and captions, per language; covers from the closing card. |
| **Every language** | Your audiences | Text, on-screen words, voice and captions per locale; falls back cleanly when a translation is missing. |
| *Optional:* posting desk | The comms team | Preview, reorder, request changes, approve; approved posts go out on schedule to YouTube, Instagram, X. |
| *Optional:* daily campaign | Marketing / awareness | A calendar of daily shorts with channel copy per day. |

The site can be built in React/Next.js, Svelte/SvelteKit, Vue/Nuxt, Astro or plain HTML: the stories are data and the
animation engine is a framework-free core with web components.

## 2 · The core idea

A story is **written once as data**:

- the **article**: title, summary, sections, the takeaway (per language);
- the **film**: 5–8 **scenes**, each a JSON file describing what is on screen and how it moves over time; every word
  comes from a per-language strings file;
- the **voice script**: one line per scene (per language);
- the **sound**: a few soft tones timed to what happens on screen.

Because a scene is a pure function of time, the same file is the article's figure, a slide in the player and a
stretch of video. Change a word or a position once and every output follows.

## 3 · Roles

| Role | Does | Approves |
|---|---|---|
| **Owner** (product owner, L&D lead) | Sets purpose and scope; answers questions; reviews | Outline, item cards, look, pilot, each story, release |
| **Subject expert** | Supplies sources; checks facts | Accuracy |
| **Language reviewer** (per locale) | Reviews translations | Each locale's text and voice |
| **Legal / compliance** (when needed) | Reviews regulated wording | Sensitive claims |
| **Claude** (with this plugin) | Interviews, plans, writes, builds, renders, verifies, fixes | Nothing: it shows evidence and asks |

## 4 · The program, phase by phase

Each phase ends at a **gate**: the owner sees evidence (screenshots, contact sheets, videos) and approves before the
next phase starts. Claude keeps a tracker of gates and items in `project/tracker.md`.

| Phase | What happens | Gate (approved by the owner) |
|---|---|---|
| **0 · Start** | Import the plugin; say "build our story site" (or "build the learning portal"). Claude creates `project/` and asks its first questions. | |
| **1 · Interview & outline** | Purpose, audience, languages, stack, media scope; brand and tone; sources and topics. Claude drafts the site map and the **catalogue** (every story with format, topic, priority, sources) and picks a **pilot**. | **A** · outline approved |
| **2 · Item cards** | For the pilot and the first batch: audience, objective, the one message, the punchline, the scene plan with the picture for each scene, facts with sources, voice draft. Fact-checked. | cards approved (in batches) |
| **3 · Foundation** | The app in your stack, the kit installed, routes (home, index, story, player), the brand applied, all launch languages wired. Shown with the sample story at phone, tablet and desktop widths. | **B** · look approved |
| **4 · Pilot** | One story end to end: article, scenes, sound, contact sheets in each language, video if in scope. Iterated with you until it's right. Its settled rules become the **style guide**. | **C** · approach approved |
| **5 · Batches** | Stories built in batches of 3–5 (scene builders work in parallel), each self-checked and visually reviewed before you see it. You review with the review sheet; Claude fixes and shows before/after. | each story approved |
| **6 · Languages** | Each approved story drafted in the other locales, validated, laid out and checked; native review. | each locale approved |
| **7 · Media** | Voice per locale, timing fitted to the voice, video rendered and built with captions and covers. | videos approved |
| **8 · Release** | Accessibility, SEO, performance, prerendering per locale, daily rebuild; optional posting desk and campaign. | **E** · release |
| **9 · Run** | New stories through the same loop; feedback and analytics feed the next batch. | |

## 5 · How you review and give feedback

- You get, per story: the **contact sheet** (every scene's final picture, landscape and portrait, per language), the
  **page** (desktop and phone), the **player** link and, when made, the **video**.
- Mark each scene in the **review sheet** (content, look, motion, text) or just say what's wrong in plain words:
  "scene 3, the arrow should attach to the middle of the card", "make the title shorter in German".
- Claude turns each remark into a change request, fixes it in the data, re-checks it visually, and replies with the
  after image. Rules that generalise go into the style guide and are applied to other stories.
- Changing text after voice was recorded means re-recording those lines; Claude will say which.

## 6 · Conventions that keep it consistent

- **Slugs and scene ids** are permanent kebab-case names (`spot-a-phish`, `hook`, `signs`, `close`).
- **Scene grammar:** words on the left, the picture on the right; one idea per scene; the head arrives first, the
  picture builds in the order the voice names things; each scene ends on a held picture; calm motion.
- **The closing scene** is the punchline (3–9 words) with one line under it and your logo, nothing else: it is the
  last thing seen and heard, the video cover, the social preview image and the article's "short version".
- **Every claim has a source**; made-up example numbers say "Illustrative" on screen.
- **Sound** is a few soft tones on the moments that matter, never background music, and always off until the viewer
  turns it on.
- **Languages:** no words inside scene geometry; every word is a key in a strings file; layouts are sized for the
  longest language; dates and numbers formatted per locale.

## 7 · What's in the box

```
The code is on npm: @senseihq/emaki (core, web components, loaders, JSON Schemas), @senseihq/emaki-svelte |
-react | -vue (components and player state), @senseihq/emaki-posting (the desk), @senseihq/emaki-cli (the `emaki`
command: init, plugin install, validate, new, sheet, voice, fit, render, build; it carries this plugin and a complete
bilingual sample story).

emaki/  (installed as .claude/emaki/ plus .claude/skills and .claude/agents)
  PLAYBOOK.md                 this document
  README.md                   install, share, quick start
  skills/                     emaki (the program) · story-build · story-review · story-localize
                              · story-media · story-publish   (+ references: interview, architecture, content model,
                              scene authoring, voice & video, i18n, quality gates, feedback loop, publishing)
  agents/                     story-planner · scene-builder · story-writer · visual-reviewer · fact-checker · localizer
  templates/                  brief, decisions, outline, item card, review sheet, change request, style guide,
                              tracker, changelog, glossary
  modules/                    posting-desk (reference implementation + security model) · campaign (templates)
```

## 8 · Prerequisites

- Node 20+ and your framework's toolchain; `playwright` (Chromium) for contact sheets and video; ffmpeg. Python only
  for Piper/Kokoro voices and the posting desk's poster.
- For narrated video, one voice engine per language: free and offline (Piper, Kokoro), your organisation's cloud
  (Azure AI Speech, Google Cloud Text-to-Speech, Amazon Polly, OpenAI), ElevenLabs, or a person recording. Claude
  asks which when video comes up and records the choice; it writes and times the script either way.
- For the posting desk: an identity proxy (Cloudflare Access, Google IAP, Azure AD), a small database, object storage,
  a scheduler (GitHub Actions or similar), and the platform accounts.
- Secrets live in environment variables or your CI's secret store, never in files.

## 9 · FAQ

**Can we start without video?** Yes. Articles and the player need no voice or rendering; add media later per story.

**Do we need a text-to-speech subscription?** No. Piper and Kokoro run free and offline on a laptop with good
quality, which also keeps unreleased content private. If your organisation already uses Azure, Google Cloud or AWS,
their voices are excellent and are usually already approved for use. Claude doesn't produce audio itself: it writes the
script, the pronunciations and the translations, and drives whichever engine you pick.

**Can we use our own design system?** Yes. The site pages are yours; scenes take their colours and fonts from one
`look.css` per film, which you set to your tokens on the pilot.

**What if a picture can't be expressed in the JSON format?** Scenes can fall back to a small JavaScript module with the
same rules; when a need repeats, it becomes a new JSON component instead.

**How long does a story take?** After the pilot, a batch of 3–5 stories typically takes a day of building plus your
review time; translations and videos are mostly automated after approval.

**Who owns what after handover?** Your team owns `content/` (the stories) and `project/` (the decisions and style
guide); adding a story is `emaki new` plus the per-story loop, with Claude or by hand.
