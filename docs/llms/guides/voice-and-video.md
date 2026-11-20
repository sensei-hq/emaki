# Voice, timing and video

Optional module; the site works without it (figures and the player are silent unless the viewer turns on sound).
The same takes narrate the site and the videos. Needs ffmpeg, Playwright (Chromium), and one voice provider per locale.

## Choosing the voice provider

Claude writes the script, the pronunciations and the translations; the audio comes from a speech engine or a person.
the `emaki` CLI's TTS providers supports these, set per locale in `emaki.config.json` (`voice.default`, `voice.<lang>`,
`voice.<locale>`; a block that names a different provider starts fresh):

| Provider | Runs | Cost | Quality | Good for | Needs |
|---|---|---|---|---|---|
| `piper` | offline, any OS | free | good, clear | default for teams with no TTS account; private content; air-gapped | `pip install piper-tts` + a voice file (.onnx + .onnx.json) per language |
| `kokoro` | offline, any OS | free | very natural | best free quality in en, es, fr, it, pt, hi, ja, zh | `pip install kokoro soundfile` (pulls PyTorch), espeak-ng |
| `macos` | offline, Mac | free | fair | quick drafts and timing passes | macOS `say` (more voices in Accessibility › Spoken Content) |
| `espeak` | offline, any OS | free | robotic | timing drafts only | espeak-ng |
| `azure` | cloud | per character | excellent, 140+ locales | Microsoft 365 / Azure organisations | `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION` |
| `google` | cloud | per character | excellent | Google Workspace / GCP organisations | `GOOGLE_TTS_API_KEY` or `gcloud auth login` |
| `polly` | cloud | per character | very good | AWS organisations | the `aws` CLI + AWS credentials |
| `openai` | cloud | per character | natural, steerable tone | teams with OpenAI or Azure OpenAI | `OPENAI_API_KEY` (or `AZURE_OPENAI_ENDPOINT` + key) |
| `elevenlabs` | cloud | subscription | top | premium narration, voice cloning | `ELEVENLABS_API_KEY` |
| `manual` | a person | time | human | regulated or brand-critical narration | recorded `take-NN.wav` files |

Rules: use the same voice for a locale across the whole site; the default recommendation is the organisation's
existing cloud platform if it has one (procurement and data agreements already exist), otherwise Piper (free,
offline, private). Use `macos`/`espeak` only for draft timing passes, never for published video. Keys go in
environment variables or the CI secret store, never in `emaki.config.json` (`set-voice` refuses them).

```sh
emaki tts-check                                    # per locale: provider and whether it's ready here
emaki voices --locale es --provider azure          # list voices to choose from
emaki set-voice --locale es --provider azure --opt voice=es-ES-ElviraNeural
emaki voice <slug> --locale es --provider macos     # one-off override (e.g. a draft pass)
```

## Steps per story per locale

```sh
emaki voice  <slug> --locale en      # takes from voice/en.json → production/<slug>/en/takes/
emaki fit    <slug> --locale en      # timing.en.json: each narrated scene runs for its take
emaki voice-web <slug> --locale en   # the site's narration: voice/en/<scene>.m4a + each scene's voice start
emaki render <slug> --locale en      # 16:9 + 9:16 picture with the score, covers
emaki build  <slug> --locale en      # voice laid at each scene start, score ducked, -14 LUFS, captions
```

Render, for the moments in between:

```sh
emaki render <slug> --o portrait --from 12 --to 20 --out preview.mp4   # one stretch of film time, to a file
emaki render <slug> --audio-only     # lay a changed score on the existing render; no frames captured
emaki render <slug> --cover-only     # refresh just the covers
emaki render <slug> --music export   # the audio of production/<slug>/<locale>/<slug>.mp4 (or --music none)
emaki build  <slug> --check          # each scene's take, freeze and start; builds nothing
```

A render survives the dev server reloading the page mid-capture (someone saving a file): it waits for the show to
come back and repeats the frame.

- **Voice script**: 150 words a minute; each line ≤ the scene's length minus 2 s (lead 0.6 s + tail 1.2 s), or the
  scene runs longer. Write for the ear: short sentences, the scene's point first, numbers spoken as words where it helps.
  Put tricky pronunciations in `say` (`"Sen-say"`, `"S-Q-L"`). Same voice per locale across the site.
- **Fit vs retime**: `fit` runs each narrated scene for lead + take + tail: longer than its design (it holds its last
  picture until the voice ends) or shorter (it ends with the voice), but never before its content has settled, the
  end of its last track (the camera push and the closing mark's breathing are background and do not count). A JS
  scene has no tracks to read: give `settle` (seconds) on its film.json entry, or it keeps its design length when
  the voice is shorter. When a beat must land on a word, retime the scene's track times (and the matching `T.<scene>` times in score.js) or add
  a hold `[[at, seconds]]` in `timing.<locale>.json` to pause the clock at that moment.
- **Narration on the site**: `voice-web` encodes each take as `content/films/<slug>/voice/<locale>/<scene>.m4a`
  (mono AAC 64k, -16 LUFS, about 8 KB a second) and records `voice` (the lead, 0.6 s) per scene in
  `timing.<locale>.json`. With sound on, the story player speaks the scene on screen from where the picture is and
  ducks the score under it; an article figure's sound button plays its scene's take with its slice of the score.
  The voice is its own cut: the chrome's VO toggle (`V`) silences the narration while the score plays on unducked
  (`show.setVoice(false)` does the same from code), and hides with CC when the film has no voice lines. Commit the
  `.m4a` files with the story; rerun `voice-web` after re-recording a take (a scene whose take is gone
  loses its file). Vite apps glob them as URLs (`voice` in the source, written by `emaki init`); the fetch loader
  reads them from the published content folder.
- **Captions** come from the voice text (`.vtt` for the site player, `.srt` for uploads, burned in with `build --captions`). Review them in
  every locale. On the site, the player's CC toggle captions the scene on screen, and an article figure whose scene
  has a voice line gains its own CC toggle with a polite caption overlay; without a line neither renders.
- **Freeze, the safety net**: when a take is longer than its scene in the render (a take re-recorded after the render,
  or `fit` skipped), `build` freezes the scene's last frame until the voice has finished, loops the score under the
  hold and moves every later scene along. `build --check` shows it in the `ext` column. A freeze is a still picture;
  `fit` and a fresh render give the scene its ambient motion instead.
- **Covers**: the last frame of the close scene, per orientation and locale; the 16:9 one is copied to the site's
  covers folder (`coversDir`) as the og:image. `build` turns them into `poster.jpg`, `poster-vertical.jpg` and
  `<slug>-<locale>-thumb.jpg` (1280x720, YouTube's custom thumbnail).
- **Chapters**: one per scene is embedded in each final MP4; `chapters.txt` is YouTube's list (from 0:00, every
  chapter ≥ 10 s, short scenes folded in), and `description.txt` is title + chapters + the story link
  (`<site url>/<locale>/stories/<slug>`, or `storyUrl` in `emaki.config.json`, e.g. `{site}/articles/{slug}`).
- **Credentials**: every provider key lives in the environment only; never in files, never committed, never printed,
  never pasted into chat. Each take run records which provider and voice made it (`takes/provider.json`).

## One film-level state

A film plus its figures behave as one film: lift a single `{ sound, cc, voice }` object over the article and pass
it to the show and every figure as controlled props. A defined prop drives the player (the app wins over the
toggles) while every toggle still reports through its change event; an undefined prop keeps per-instance toggles.
The elements (`<motion-show>`, `<motion-scene>`) stay uncontrolled.

```svelte
<script lang="ts">
  import { MotionScene, MotionShow } from '@senseihq/emaki-svelte';
  let film = $state({ sound: false, cc: false, voice: true });
</script>

<MotionShow
  film="phishing-101" locale="en"
  sound={film.sound} cc={film.cc} voice={film.voice}
  onsoundchange={(on) => (film.sound = on)}
  onccchange={(on) => (film.cc = on)}
  onvoicechange={(on) => (film.voice = on)}
/>
<MotionScene
  film="phishing-101" scene="signs" locale="en"
  sound={film.sound} cc={film.cc} voice={film.voice}
  onsoundchange={(on) => (film.sound = on)}
  onccchange={(on) => (film.cc = on)}
/>
```

React names the events `onSoundChange`/`onCcChange`/`onVoiceChange` (figures only report captions); Vue emits
`update:sound`/`update:cc`/`update:voice` (figures: `update:cc`).

## Delivery checklist

- Durations: film 60–90 s, short 30–60 s. Loudness -14 LUFS, true peak ≤ -1.5 dB.
- Watch the first and last 5 s of every render; spot-check each scene change for a frozen or blank frame.
- 9:16 safe area: nothing important in the bottom 300 px (platform UI) or top 150 px.
- File names: `<slug>-<locale>-16x9.mp4`, `-9x16.mp4`, `-web.mp4` (keep it under 25 MiB for static hosting),
  `.vtt`, `.srt`, `cover-16x9.jpg`, `-thumb.jpg`, `poster.jpg`, `chapters.txt`, `description.txt`.
