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

Call `setupMotion({ source, site, logos })` once on the client first. Composables: `useScenePlayer(player)` (a
reactive snapshot of a `ScenePlayerState`) and `useShowState(showRef)`.

MIT © SenecaGlobal
