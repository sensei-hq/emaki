# @senseihq/emaki-cli

`emaki`: set a project up for motion stories, install the Claude plugin, run the production steps per film and per
locale, and take finished pieces out: stage them for approval, publish them, and run a daily campaign.

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
| `voice-web <slug> [--locale]` | the site's narration: each take as `voice/<locale>/<scene>.m4a` (mono AAC, -16 LUFS) and its start in `timing.<locale>.json` |
| `render <slug> [--locale] [--o both] [--fps 30] [--from s] [--to s] [--out file.mp4\|dir] [--music synth\|export\|none] [--audio-only] [--cover-only]` | picture + music + covers; `--from/--to` a stretch of film time, `--out` a file (one layout) or a folder, `--music export` the audio of `production/<slug>/<locale>/<slug>.mp4`, `--audio-only` lays the music on the existing render, `--cover-only` just the covers; survives the dev server reloading mid-capture |
| `build <slug> [--locale] [--no-captions] [--check] [--out dir]` | voice + ducked music, −14 LUFS, captions (.srt/.vtt, burned in), a chapter per scene embedded, `-web.mp4`, `chapters.txt`, `description.txt`, posters and `-thumb.jpg`; a take that outruns its scene freezes the scene's last frame until it ends (`--check` prints that table and builds nothing) |
| `stage <slug> [--channels a,b] [--locale] [--dry-run]` | upload a finished piece's media (sha256-checked) and post text to the posting desk, one post per channel, for approval; a film's text is drafted into `content/films/<slug>/post.<locale>.json` on the first run |
| `stage status [slug]` | report each story's script and what is produced (takes, renders, Short, carousel) to the desk's plan |
| `stage requests`, `stage reply <id> "text" [--working \| --done]` | read the open motion requests from the desk (with their threads) and answer them |
| `publish youtube <slug> [--privacy unlisted] [--update id] [--force-new] [--description-mode prepend]` | upload the 16:9 film with chapters, tags, captions and the cover as thumbnail; `--update` refreshes an uploaded video in place |
| `publish instagram <slug> [--video-url u --cover-url u]` | post the 9:16 film as a Reel; without URLs the files go to the desk and are linked (signed) for an hour |
| `publish … --dry-run`, `publish youtube\|instagram --verify` | print exactly what would post and send nothing; check the keys read-only and name the account |
| `carousel <slug…> \| --all` | a campaign day's Instagram carousel, 1080×1350 PNGs from its day script (needs Playwright) |
| `campaign status [--from] [--days 14]` | what is due, and for each day: story, film, takes, render, Short, carousel, posts |
| `campaign shortfilm <slug>` | a Short's film (one scene per beat, the voice lines) from its day script's voiceover table |
| `campaign posted <slug> [--youtube id] [--instagram url] [--x url]` | record where a piece went: the campaign's `published.json` and the story's `social` links |
| `campaign due [--date]`, `campaign calendar` | one day's piece as JSON (for automation); rewrite `CALENDAR.md` from `calendar.csv` |

Voice providers, set per locale in `emaki.config.json` (`default` → language → locale): **offline** `piper`,
`kokoro`, `macos` (`say`), `espeak`; **cloud** `elevenlabs`, `openai` (or Azure OpenAI), `azure`, `google`, `polly`
(via the `aws` CLI); **a person** `manual`. Keys come from environment variables only.

After the build. `publish` writes each new link into the story's entry in `content/stories/index.json` (`youtube`
and `social`) and never replaces one that is there. Published files come from `production/<slug>/<locale>/`
(`out/<slug>-<locale>-16x9.mp4`, `-9x16.mp4`, `.srt`, `out/description.txt` if you wrote one, and the covers in
`render/`). A campaign lives in `campaign/` (`calendar.csv`, `days/day-NN-<slug>.md`, `carousels/<slug>/`,
`published.json`); a day script gives every channel's text for `stage`. Settings in `emaki.config.json`, all
optional: `campaign` (the folder), `storyUrl` (a story's public link, default `{url}/{locale}/stories/{slug}`), and
`carousel` (`marks` per topic, `mark`, `footer`, `swipe`, `last`, or a `template` HTML file).

Credentials come from environment variables (or CI secrets) only; nothing writes them to a file or prints them:

| Variable | For |
|---|---|
| `ADMIN_ORIGIN` | the posting desk's site (default: `url` in `content/site.json`); `ADMIN_API` if its API is not at `/api/admin` |
| `STAGER_CLIENT_ID`, `STAGER_CLIENT_SECRET` | the stager's Cloudflare Access service token: `stage`, and Instagram media for `publish` |
| `MEDIA_URL_SECRET` | signs the one-hour media links Instagram fetches (the desk's secret); `MEDIA_PATH` if not `/m` |
| `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` | YouTube Data API, scopes `youtube.upload` and `youtube.force-ssl` |
| `IG_USER_ID`, `IG_ACCESS_TOKEN` (`IG_GRAPH_VERSION`, default `v21.0`) | Instagram Graph API, `instagram_content_publish` |

Load them from a file that git ignores without writing them anywhere else, e.g. `node --env-file=.env
node_modules/.bin/emaki stage <slug>` or `set -a; . ./.env; set +a`.

Needs Node 20.10+, ffmpeg, and Playwright with Chromium for `sheet`, `render` and `carousel`. The same steps are importable as
functions from `@senseihq/emaki-cli` (`project`, `validate`, `voice`, `voiceWeb`, `fit`, `render`, `build`, `stage`, `publish`,
`youtube`, `instagram`, `carousel`, `campaignStatus`, …); every network call takes an injectable `fetch`.

MIT © SenecaGlobal
