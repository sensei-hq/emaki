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
| `MotionScene` | `film`, `scene`, `layout` (`figure`), `locale`, `mode` (`auto`), `autoplay` (true) |
| `MotionShow` | `film`, `locale`, `layout` (`landscape`), `mode` (`auto`), `controls` (true), `slide`, `loop`, `bind:show` (state + controller) |
| `ScenePlayer` | `player: ScenePlayerState`, `locale`, `mode` (`auto`), `controls` |
| `ShowPage` | `film`, `layout`, `locale`, `mode` (capture: `light`), `src` (`json`/`js`, forces the scene source), `capture` |

`mode` is `light`, `dark` or `auto`. Auto follows the page's `data-mode` (as rokkit's `themable` sets it), else the
OS, and the scenes redraw when it changes. A film draws dark only if it has a dark look (see @senseihq/emaki).

`reactivePlayer(() => player)` and `reactiveShow()` give Svelte-reactive reads of the core's state classes for your
own chrome. Keys on the player: ←/→ scene, Space play/pause, M sound, O orientation.

MIT © SenecaGlobal
