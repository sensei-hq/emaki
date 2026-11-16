# @senseihq/emaki-cli

`emaki`: set a project up for motion stories, install the Claude plugin, and run the production steps per film and
per locale.

```sh
npm i -D @senseihq/emaki-cli playwright && npx playwright install chromium
npx emaki init            # sample content, emaki.config.json, film source, /show capture route, the plugin
```

| Command | What |
|---|---|
| `init [--framework x] [--no-sample] [--no-plugin]` | detects SvelteKit / Svelte / React / Next / Vue / Nuxt / plain; never overwrites |
| `plugin install [--force]` | skills, agents, playbook and templates into `.claude/` |
| `skills [add <name…> \| --all]`, `agents [add …]` | list or install single skills and agents |
| `manifest` | `content/films/index.json` (for the fetch loader) |
| `validate [slug]` | files, scene ids, `{{keys}}` in every locale, voice lines, story bodies |
| `new <slug> --scenes a,b,c [--title] [--date]` | scaffold a story + film in every locale |
| `migrate <site> [--locale en]` | move a sensei-hq.com-style site (`src/lib/motion`, `src/lib/content/articles`, `films/` takes) into `content/` and `production/`; never overwrites, then validates |
| `sheet <slug> [--locale] [--at scene:t,…]` | contact sheet, both orientations |
| `tts-check` | each locale's voice provider and whether it's ready; offline engines on this machine |
| `set-voice --locale x --provider p [--opt k=v]` | choose the voice; keys are refused (environment only) |
| `voices [--locale] [--provider]` | the voices a provider offers |
| `voice <slug> [--locale] [--only 2,5] [--provider] [--opt]` | narration takes from `voice/<locale>.json` |
| `fit <slug> [--locale] [--check]` | scene times fitted to the takes: `timing.<locale>.json` |
| `render <slug> [--locale] [--o both] [--fps 30] [--from s] [--to s] [--out file.mp4\|dir] [--music synth\|export\|none] [--audio-only] [--cover-only]` | picture + music + covers; `--from/--to` a stretch of film time, `--out` a file (one layout) or a folder, `--music export` the audio of `production/<slug>/<locale>/<slug>.mp4`, `--audio-only` lays the music on the existing render, `--cover-only` just the covers; survives the dev server reloading mid-capture |
| `build <slug> [--locale] [--no-captions] [--check] [--out dir]` | voice + ducked music, −14 LUFS, captions (.srt/.vtt, burned in), a chapter per scene embedded, `-web.mp4`, `chapters.txt`, `description.txt`, posters and `-thumb.jpg`; a take that outruns its scene freezes the scene's last frame until it ends (`--check` prints that table and builds nothing) |

Voice providers, set per locale in `emaki.config.json` (`default` → language → locale): **offline** `piper`,
`kokoro`, `macos` (`say`), `espeak`; **cloud** `elevenlabs`, `openai` (or Azure OpenAI), `azure`, `google`, `polly`
(via the `aws` CLI); **a person** `manual`. Keys come from environment variables only.

Needs Node 20.10+, ffmpeg, and Playwright with Chromium for `sheet` and `render`. The same steps are importable as
functions from `@senseihq/emaki-cli` (`project`, `validate`, `voice`, `fit`, `render`, `build`, …).

MIT © SenecaGlobal
