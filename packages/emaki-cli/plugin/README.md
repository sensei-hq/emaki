# emaki

A Claude (Code / Cowork) plugin for building a site of **motion stories**: reader-friendly
articles, a presentation-ready story player and narrated videos, all rendered from the same JSON scenes, in every
language you configure. Framework-agnostic (React, Svelte, Vue, Astro, plain HTML).

Built for teams like L&D (a learning portal) or communications and alert teams (an awareness or advisory site).

## Install

```sh
npx @senseihq/emaki-cli init            # in your app: sample content, config, film source, /show route, and this plugin
npx @senseihq/emaki-cli plugin install  # or just the plugin, into .claude/ (skills, agents, playbook, templates)
```

Then, in Claude with the project open, say: *"Build our learning portal with the emaki playbook."*
In Cowork you can also add this folder as a plugin.

## What happens next

Claude interviews you (purpose, audience, languages, stack, media, brand, sources), proposes an outline and a
catalogue of stories, agrees each story's details with you, builds the foundation and one pilot story for you to
approve, then builds the rest in batches you review, with translations and videos as you choose. Every step shows
evidence (contact sheets, screenshots, videos) and waits for your approval at the gates. See `PLAYBOOK.md`.

## Contents

| Folder | What |
|---|---|
| `PLAYBOOK.md` | The method: roles, phases, gates, review loop, conventions, FAQ |
| `skills/` | `emaki` (the program), `story-build`, `story-review`, `story-localize`, `story-media`, `story-publish` |
| `agents/` | `story-planner`, `scene-builder`, `story-writer`, `visual-reviewer`, `fact-checker`, `localizer` |
| `templates/` | Brief, decisions, outline, item card, review sheet, change request, style guide, tracker, changelog, glossary |
| npm `@senseihq/*` | The code: `emaki` (core, web components, loaders, schemas), `motion-svelte` / `-react` / `-vue`, `motion-posting`, `motion-cli` (the `emaki` command, which also installs this plugin) |
| `modules/` | `posting-desk` (approval-gated social posting, reference implementation) and `campaign` (daily shorts) |

## Try the sample in two minutes

```sh
npm create vite@latest my-stories -- --template svelte-ts && cd my-stories
npx @senseihq/emaki-cli init && npm i @senseihq/emaki @senseihq/emaki-svelte
npx emaki validate          # the sample film, en + es
```

## Requirements

Node 20+; `npm i -D playwright && npx playwright install chromium` (contact sheets, video); ffmpeg (video). For voice, any one of: Piper or Kokoro (free, offline), macOS `say` (drafts), Azure AI Speech,
Google Cloud TTS, Amazon Polly, OpenAI, ElevenLabs, or recorded takes; Claude asks which. Keys are read from
environment variables; no secrets are stored in this kit.

Version 0.2.0 (pluggable voice: offline and organisation platforms).
