// The state behind the <motion-scene> element and the framework adapters (ui-state-pattern): what scene is loaded, where the
// playhead is, whether it plays. Plain data + named transitions, no DOM: the component mounts,
// renders and runs the clock; the load seam (the registry) feeds it.
import type { Layout } from './types.js';

export type PlayerStatus = 'idle' | 'ready' | 'error';
export type SceneSource = 'json' | 'js';

export interface SceneRef {
  film: string;
  scene: string;
  layout: Layout;
  src?: SceneSource;
}

export class ScenePlayerState {
  #listeners = new Set<(p: ScenePlayerState) => void>();
  /** Bumped on every change, so frameworks can re-render from a snapshot (React's useSyncExternalStore, Vue refs). */
  version = 0;
  ref: SceneRef | null = null;
  t = 0;
  dur = 0;
  status: PlayerStatus = 'idle';
  error = '';
  playing = false;
  loop = true;
  /** Seconds to rest on the last frame before looping. */
  hold = 0;
  /** How many times the scene has looped (a cue for anything that restarts with it, such as its sound). */
  loops = 0;

  /** Changes whenever the mount must be rebuilt (film, scene, layout or source). */
  get key(): string {
    const r = this.ref;
    return r ? `${r.film}:${r.scene}:${r.layout}:${r.src ?? ''}` : '';
  }

  /** Calls `fn` after every transition; returns the unsubscribe. */
  subscribe(fn: (p: ScenePlayerState) => void): () => void {
    this.#listeners.add(fn);
    return () => this.#listeners.delete(fn);
  }

  protected changed() {
    this.version++;
    for (const fn of this.#listeners) fn(this);
  }

  /** Point at a scene; the component remounts and reports back via markReady/fail. */
  load(ref: SceneRef) {
    this.ref = { ...ref };
    this.t = 0;
    this.dur = 0;
    this.status = 'idle';
    this.error = '';
    this.playing = false;
    this.changed();
  }

  markReady(dur: number) {
    this.dur = dur;
    this.t = 0;
    this.status = 'ready';
    this.changed();
  }

  fail(message: string) {
    this.status = 'error';
    this.error = message;
    this.playing = false;
    this.changed();
  }

  seek(t: number) {
    this.t = Math.max(0, Math.min(this.dur, t));
    this.changed();
  }

  play() {
    if (this.dur > 0 && this.t >= this.dur) this.t = 0;
    this.playing = true;
    this.changed();
  }

  pause() {
    this.playing = false;
    this.changed();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  /** Advance the playhead; stops at the end unless looping. */
  tick(dt: number) {
    if (!this.playing) return;
    const next = this.t + dt;
    if (next >= this.dur) {
      if (this.loop && this.dur > 0) this.t = 0;
      else {
        this.t = this.dur;
        this.playing = false;
      }
    } else {
      this.t = next;
    }
    this.changed();
  }
}
