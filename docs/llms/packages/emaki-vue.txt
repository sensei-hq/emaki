# @senseihq/emaki-vue

Vue 3 components and composables for motion stories, over `@senseihq/emaki`. Written as render functions, so no
SFC compiler is needed. Client-only (in Nuxt, wrap them in `<ClientOnly>`).

```sh
npm i @senseihq/emaki @senseihq/emaki-vue
```

```vue
<script setup lang="ts">
import { MotionScene, MotionShow, ScenePlayer, ShowPage } from '@senseihq/emaki-vue';
</script>

<template>
  <MotionScene film="phishing-101" scene="signs" locale="es" />
  <div style="aspect-ratio:16/10"><MotionShow film="phishing-101" locale="es" @ready="(s) => (show = s)" /></div>
  <ScenePlayer :player="player" controls />
  <ShowPage :film="film" capture layout="portrait" locale="es" />
</template>
```

Every component takes `mode`: `light`, `dark` or `auto` (the default). Auto follows the page's `data-mode` (as rokkit's
`themable` sets it), else the OS, and the scenes redraw when it changes. A film draws dark only if it has a dark look
(see @senseihq/emaki); `ShowPage` captures light unless asked, and its `src` (`json`/`js`) forces where scenes come
from.

`MotionShow` props: `film`, `locale`, `layout`, `mode`, `poster` (cover frame first; `title`, `length` on it), `cover` (an
image URL shown with the play button; the show is created on the first click, sound on), `fullscreenHref`, `controls`,
`slide`, `loop`; `@ready(show)`. Its controls show a progress tick per scene.

Call `setupMotion({ source, site, logos })` once on the client first. Composables: `useScenePlayer(player)` (a
reactive snapshot of a `ScenePlayerState`) and `useShowState(showRef)` (`{ index, local, playing, sound, layout, started }`, the playhead followed once a frame).

MIT © sensei-hq
