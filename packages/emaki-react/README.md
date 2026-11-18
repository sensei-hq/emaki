# @senseihq/emaki-react

React components and hooks for motion stories, over `@senseihq/emaki`. React 18+; client components (in Next.js,
import them from a `'use client'` file).

```sh
npm i @senseihq/emaki @senseihq/emaki-react
```

```tsx
import { MotionScene, MotionShow, ScenePlayer, ShowPage, ScenePlayerState, useScenePlayer, useShowState } from '@senseihq/emaki-react';

<MotionScene film="phishing-101" scene="signs" locale="es" />                  // article figure, loops while visible
<div style={{ aspectRatio: '16/10' }}><MotionShow film="phishing-101" locale="es" onReady={setShow} /></div>
<ScenePlayer player={player} controls />                                       // a scene you drive
<ShowPage film={film} capture layout="portrait" locale="es" />                 // the /show/[film] capture page
```

Call `setupMotion({ source, site, logos })` once on the client first (`emaki init` writes the source file).

| Export | What |
|---|---|
| `MotionScene` | `film`, `scene`, `layout` (`figure`), `locale`, `mode` (`auto`), `autoplay` |
| `MotionShow` | `film`, `locale`, `layout`, `mode` (`auto`), `poster` (cover frame first; `title`, `length` on it), `cover` (an image URL shown with the play button; the show is created on the first click, sound on), `fullscreenHref`, `controls`, `slide`, `loop`, `onReady(show)`; the controls show a progress tick per scene |
| `ScenePlayer` | `player`, `locale`, `mode` (`auto`), `controls` |
| `ShowPage` | `film`, `layout`, `locale`, `mode` (capture: `light`), `src` (`json`/`js`, forces the scene source), `capture` |
| `useScenePlayer(player)` | re-renders on every change of a `ScenePlayerState` (useSyncExternalStore) |
| `usePlayerFor(ref)` | a player you own, pointed at `{ film, scene, layout }` |
| `useShowState(show)` | `{ index, local, playing, sound, layout, started }` of a player controller (the playhead followed once a frame) |

`mode` is `light`, `dark` or `auto`. Auto follows the page's `data-mode` (as rokkit's `themable` sets it), else the
OS, and the scenes redraw when it changes. A film draws dark only if it has a dark look (see @senseihq/emaki).

MIT © sensei-hq
