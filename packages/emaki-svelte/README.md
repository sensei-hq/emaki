# @senseihq/emaki-svelte

Svelte 5 components for motion stories, over `@senseihq/emaki`.

```sh
npm i @senseihq/emaki @senseihq/emaki-svelte
```

```svelte
<script lang="ts">
  import { MotionScene, MotionShow, ScenePlayer, ShowPage, ScenePlayerState } from '@senseihq/emaki-svelte';
</script>

<MotionScene film="phishing-101" scene="signs" locale="es" />          <!-- an article figure: loops while visible -->
<div style="aspect-ratio:16/10"><MotionShow film="phishing-101" locale="es" bind:show /></div>   <!-- the player -->
<ScenePlayer {player} controls />                                       <!-- a scene you drive (editors, previews) -->
<ShowPage film={data.film} capture={data.capture} layout={data.layout} locale={data.locale} />  <!-- /show/[film] -->
```

Call `setupMotion({ source, site, logos })` once on the client before these mount (`emaki init` writes
`emaki-source.ts` with a `startMotion()` for this). In SvelteKit, set `ssr = false` on the `/show/[film]` route;
render the article text on the server and let the components hydrate.

| Component | Props |
|---|---|
| `MotionScene` | `film`, `scene`, `layout` (`figure`), `locale`, `mode` (`auto`), `autoplay` (true), `t` (drive it yourself), `hold` (2 s rest before looping), `label` (alt text), controlled `sound`/`cc`/`voice` + `onsoundchange`/`onccchange`; a still under reduced motion; a sound button when the scene has sound (its slice of the score, its narration); a CC toggle + caption overlay when the scene has a voice line |
| `MotionShow` | `film`, `locale`, `layout` (`landscape`), `mode` (`auto`), `poster` (cover frame first; `title`, `length` on it), `cover` (an image URL shown with the play button; the show is created on the first click, sound on), `playerHref` (pop-out link; `fullscreenHref` is an alias), `controls` (true), `slide`, `loop`, `description` (the voiceover script under a Description button), `icons` (glyph overrides), `renderTick` (custom tick HTML), controlled `sound`/`cc`/`voice` + `onsoundchange`/`onccchange`/`onvoicechange`, `bind:show` (state + controller). The standard icon toolbar (prev/play/next, ticks, count, CC, mute, voice, full screen; keys Space/arrows/M/V/C/F) |
| `ScenePlayer` | `player: ScenePlayerState`, `locale`, `mode` (`auto`), `controls` |
| `ShowPage` | `film`, `layout`, `locale`, `mode` (capture: `light`), `src` (`json`/`js`, forces the scene source), `capture` |

`mode` is `light`, `dark` or `auto`. Auto follows the page's `data-mode` (as rokkit's `themable` sets it), else the
OS, and the scenes redraw when it changes. A film draws dark only if it has a dark look (see @senseihq/emaki).

`reactivePlayer(() => player)` and `reactiveShow()` give Svelte-reactive reads of the core's state classes for your
own chrome. Keys on the player: ←/→ scene, Space play/pause, M sound, V voice, C captions, O orientation, R replay
the scene, Home from the top, F fullscreen (`showKey` in the core, the same in every wrapper). The bar shows a
progress tick per scene.

A defined `sound`/`cc`/`voice` prop drives the player (the app wins over the toggles) while every toggle still
reports through its change event, so one film-level state object can hold a show plus its figures; undefined keeps
per-instance toggles (see One film-level state in the Voice and video guide).

MIT © sensei-hq
