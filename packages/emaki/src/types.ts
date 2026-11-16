// Shared types for the emaki core. Framework-free: nothing here imports a UI library.
export type Layout = 'landscape' | 'portrait' | 'figure';

/** Stage size in px for each layout. Scenes are authored on a 1920x1080 board. */
export const SIZES: Record<Layout, [number, number]> = {
  landscape: [1920, 1080],
  portrait: [1080, 1920],
  figure: [1600, 1000],
};

/** A scene as listed in film.json. `dur` is the design length in seconds, including its end hold. */
export interface SceneEntry { id: string; name: string; dur: number; desc?: string }

/** film.json: the film's look and its scenes in order. */
export interface FilmJson {
  title: string;
  look?: string;
  background: string;
  palette?: string[];
  fonts?: Record<string, { family: string; weights?: number[] }>;
  scenes: SceneEntry[];
  /** The cover frame: a scene and a time into it (default: the last scene's final picture). */
  cover?: { scene: string; at?: number };
}

/** timing.json / timing.<locale>.json: per scene, a running time (fitted to the voice) and/or pauses [at, seconds]. */
export interface TimingJson { scenes?: Record<string, { dur?: number; holds?: [number, number][] }> }

/** A scene with its running time resolved for one locale. */
export interface SceneMeta extends SceneEntry { design: number; holds: [number, number][] }
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
