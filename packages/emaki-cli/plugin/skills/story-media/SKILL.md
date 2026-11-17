---
name: story-media
description: >
  This skill should be used when the user asks to "record the voiceover", "choose a voice", "set up text to speech", "render the video", "make the Short",
  "build the videos", "fit the timing to the voice", or "make the covers" for a story. It runs voice, fit, render and
  build per locale and checks the delivery list.
metadata:
  version: "0.1.0"
---

# Voice, timing, video

Prerequisites: ffmpeg, Playwright with Chromium (`npm i -D playwright`), the dev server command in `emaki.config.json`, and a voice
provider per locale (the `emaki` CLI's TTS providers). Never ask for, print or store a key: providers read them from the environment.

0. **Voice provider.** Run `emaki tts-check`. For each locale without a provider, ask the user with
   AskUserQuestion (one question, these options, recommended first): *Your organisation's cloud platform: Azure,
   Google Cloud or AWS Polly (Recommended when they have one)*, *Piper: free, offline, private (Recommended
   otherwise)*, *Kokoro: free, offline, most natural (heavier install)*, *ElevenLabs or OpenAI (premium)*, plus
   *Recorded by a person* via the free-text option. Then: install what it needs (pip, a Piper voice file for the
   language), list voices (`emaki voices --locale <l> --provider <p>`), let the user pick or recommend one, save it
   with `emaki set-voice --locale <l> --provider <p> --opt voice=…` (or `--opt model=…` for Piper), and make one
   short sample take for approval before voicing a whole story. A provider that is "not ready" because of a missing key:
   tell the user which environment variable to set and stop; do not continue with a different provider silently.
   Draft timing passes may use `--provider macos` or `espeak`; never publish those takes.
1. Review `voice/<locale>.json` against the scenes: one line each, spoken length fits, `say` spellings for names.
2. `emaki voice <slug> --locale <l>` (or `--only 3,5` to redo takes; `--provider manual` prints the
   recording list for a person). Report each take's length; for manual takes, wait for the files.
3. `emaki fit <slug> --locale <l>`; read the table. If a beat must land on a word, retime the
   scene's tracks (and `score.js`) or add a hold in `timing.<l>.json`, then fit again.
   Then `emaki voice-web <slug> --locale <l>` so the site's player and figures speak the same takes (commit the
   `voice/<l>/*.m4a` files and `timing.<l>.json` with the story).
4. `emaki render <slug> --locale <l> --o both` (picture + score + covers; the 16:9 cover goes to the
   site's covers folder).
5. `emaki build <slug> --locale <l>` (voice, ducked score, -14 LUFS, captions).
6. Check the delivery list in `skills/emaki/references/05-voice-and-video.md`: extract frames at the start,
   each scene change and the end with ffmpeg and look at them; confirm durations and captions.
7. Report the files (paths under `production/<slug>/<l>/out/`), durations, and anything to re-record.
