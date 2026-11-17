// Shared types for the emaki core. Framework-free: nothing here imports a UI library.
export type Layout = 'landscape' | 'portrait' | 'figure';

/** Light or dark. 'auto' follows the nearest data-mode on the page (rokkit's convention), else prefers-color-scheme. */
export type Mode = 'light' | 'dark' | 'auto';

/** Stage size in px for each layout. Scenes are authored on a 1920x1080 board. */
export const SIZES: Record<Layout, [number, number]> = {
  landscape: [1920, 1080],
  portrait: [1080, 1920],
  figure: [1600, 1000],
};

/** A scene as listed in film.json. `dur` is the design length in seconds, including its end hold. `settle`: when its
 *  motion is over (seconds), so `emaki fit` never ends a narrated scene before it; JSON scenes need none (their tracks
 *  say, motionEnd), JS scenes give it or keep their design length. */
export interface SceneEntry { id: string; name: string; dur: number; desc?: string; settle?: number }

/** film.json: the film's look and its scenes in order. */
export interface FilmJson {
  title: string;
  look?: string;
  background: string;
  palette?: string[];
  /** The film's dark look. Present when look.css styles #stage[data-mode="dark"]; without it the film is always light. */
  dark?: { background: string; palette?: string[] };
  fonts?: Record<string, { family: string; weights?: number[] }>;
  scenes: SceneEntry[];
  /** The cover frame: a scene and a time into it (default: the last scene's final picture). */
  cover?: { scene: string; at?: number };
}

/** timing.json / timing.<locale>.json: per scene, a running time (fitted to the voice by `emaki fit`: longer or shorter
 *  than the design, never before the motion settles) and/or pauses [at, seconds],
 *  and `voice`: where its narration starts, in seconds into the scene (written by `emaki voice-web`). */
export interface TimingJson { scenes?: Record<string, { dur?: number; holds?: [number, number][]; voice?: number }> }

/** A scene with its running time resolved for one locale; `voice` is set when the scene is narrated on the web. */
export interface SceneMeta extends SceneEntry { design: number; holds: [number, number][]; voice?: number }
export interface FilmMeta extends Omit<FilmJson, 'scenes'> { slug: string; scenes: SceneMeta[] }

export interface Mounted {
  W: number;
  H: number;
  dur: number;
  /** The stage element at its natural size; scale it to fit with a CSS transform. */
  stage: HTMLElement;
  render: (t: number) => void;
  destroy: () => void;
}
