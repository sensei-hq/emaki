// The standard player chrome: one icon toolbar every emaki player shares — previous, play/pause,
// next, per-scene ticks with progress fill, a count, captions, mute, full screen and an optional
// pop-out link — plus the caption overlay (the current scene's voice line). Framework-free DOM
// over the show controller; the <motion-show> element and the Svelte, React and Vue wrappers
// all mount it. Icons and ticks are overridable (Rokkit's pattern: caller values merged over
// DEFAULT_CHROME_ICONS / renderTick).
import { voiceLines } from './description.js';
import { ticks, type Show } from './show.js';
import type { VoiceLine } from './types.js';

export type ChromeIconName =
  | 'prev' | 'play' | 'pause' | 'next' | 'cc'
  | 'soundOn' | 'soundOff' | 'fullscreenEnter' | 'fullscreenExit' | 'popout';

// Material Symbols paths (Apache 2.0, compatible with MIT): complete <svg> strings, one per control.
const svg = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
export const DEFAULT_CHROME_ICONS: Record<ChromeIconName, string> = {
  prev: svg('M6 6h2v12H6zm3.5 6 8.5 6V6z'),
  play: svg('M8 5v14l11-7z'),
  pause: svg('M6 19h4V5H6zm8-14v14h4V5z'),
  next: svg('M6 18l8.5-6L6 6zM16 6v12h2V6z'),
  cc: svg('M19 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2m-8 7H9.5v-.5h-2v3h2V13H11v1a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1zm7 0h-1.5v-.5h-2v3h2V13H18v1a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1z'),
  soundOn: svg('M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4-.91 7-4.49 7-8.77s-3-7.86-7-8.77'),
  soundOff: svg('M16.5 12A4.5 4.5 0 0 0 14 8v2.18l2.45 2.45q.05-.3.05-.63M19 12a7 7 0 0 1-.54 2.7l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-3-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71M4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a9 9 0 0 0 3.69-1.81L19.73 21 21 19.73l-9-9zM12 4 9.91 6.09 12 8.18z'),
  fullscreenEnter: svg('M7 14H5v5h5v-2H7zm-2-4h2V7h3V5H5zm12 7h-3v2h5v-5h-2zM14 5v2h3v3h2V5z'),
  fullscreenExit: svg('M5 16h3v3h2v-5H5zm3-8H5v2h5V5H8zm6 11h2v-3h3v-2h-5zm2-11V5h-2v5h5V8z'),
  popout: svg('M14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3m-2 16H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2z'),
};

/** One scene tick: identity, timing, and where the playhead is. */
export interface ChromeTick {
  id: string; name: string; dur: number; fill: number; done: boolean; current: boolean;
}

export interface PlayerChromeOptions {
  /** The film's slug, for its voice lines. */
  film: string;
  locale?: string;
  /** The stage element: the caption overlay mounts into it. */
  stage: HTMLElement;
  /** The standalone player page: renders the pop-out link. Hidden when absent. */
  playerHref?: string;
  /** Glyph overrides, merged over DEFAULT_CHROME_ICONS (complete <svg> strings). */
  icons?: Partial<Record<ChromeIconName, string>>;
  /** Custom tick HTML per scene (still seeks on click); void keeps the default progress tick. */
  renderTick?: (tick: ChromeTick, index: number) => string | void;
}

export interface PlayerChrome {
  el: HTMLElement;
  destroy: () => void;
}

/** Structural styles for the chrome (inherits color and font from the page). Injected once per host. */
export const CHROME_CSS = [
  '.emk-bar{display:flex;align-items:center;gap:8px;padding:8px;font:13px system-ui}',
  '.emk-bar button,.emk-bar a{display:grid;place-items:center;min-width:34px;height:34px;border-radius:8px;border:0;background:none;color:inherit;cursor:pointer;padding:0 6px;text-decoration:none}',
  '.emk-bar button:hover,.emk-bar a:hover{background:color-mix(in srgb,currentColor 12%,transparent)}',
  '.emk-bar button[aria-pressed="true"]{background:color-mix(in srgb,currentColor 22%,transparent)}',
  '.emk-bar svg{width:20px;height:20px;fill:currentColor}',
  '.emk-ticks{flex:1;display:flex;gap:4px;min-width:2rem}',
  '.emk-ticks .emk-tick{flex:1;min-width:0;height:18px;padding:7px 0;background:linear-gradient(color-mix(in srgb,currentColor 18%,transparent),color-mix(in srgb,currentColor 18%,transparent)) center/100% 4px no-repeat}',
  '.emk-ticks .emk-tick span{display:block;height:4px;border-radius:2px;background:var(--emk-accent,currentColor)}',
  '.emk-count{font-variant-numeric:tabular-nums;opacity:.7;white-space:nowrap}',
  '.emk-cap{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);max-width:82%;margin:0;padding:.45em .9em;border-radius:.4rem;background:rgb(17 27 42/.82);color:#fff;font:clamp(.85rem,1.6vw,1.25rem)/1.4 system-ui;text-align:center}',
].join('\n');

const btn = (doc: Document, cls: string, icon: string, label: string, title: string) => {
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.innerHTML = icon;
  b.setAttribute('aria-label', label);
  b.title = title;
  return b;
};

/** Mounts the standard toolbar into `host` (caption overlay into `opts.stage`), driven by `show`. */
export function mountPlayerChrome(host: HTMLElement, show: Show, opts: PlayerChromeOptions): PlayerChrome {
  const doc = host.ownerDocument;
  const icons = { ...DEFAULT_CHROME_ICONS, ...opts.icons };
  const locale = opts.locale ?? 'en';
  const style = doc.createElement('style');
  style.setAttribute('data-emk-chrome', '');
  style.textContent = CHROME_CSS;
  const bar = doc.createElement('div');
  bar.className = 'emk-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Player controls');
  const cap = doc.createElement('p');
  cap.className = 'emk-cap';
  cap.setAttribute('aria-live', 'polite');
  cap.hidden = true;
  const prev = btn(doc, 'emk-prev', icons.prev, 'Previous scene', 'Previous scene (←)');
  const toggle = btn(doc, 'emk-toggle', icons.play, 'Play', 'Play or pause (Space)');
  const next = btn(doc, 'emk-next', icons.next, 'Next scene', 'Next scene (→)');
  const ticksEl = doc.createElement('div');
  ticksEl.className = 'emk-ticks';
  ticksEl.setAttribute('role', 'group');
  ticksEl.setAttribute('aria-label', 'Scenes');
  const count = doc.createElement('span');
  count.className = 'emk-count';
  const cc = btn(doc, 'emk-cc', icons.cc, 'Captions', 'Captions (C)');
  cc.setAttribute('aria-pressed', 'false');
  const mute = btn(doc, 'emk-mute', icons.soundOff, 'Sound on', 'Sound (M)');
  mute.setAttribute('aria-pressed', 'false');
  const fs = btn(doc, 'emk-fs', icons.fullscreenEnter, 'Full screen', 'Full screen (F)');
  bar.append(prev, toggle, next, ticksEl, count, cc, mute, fs);
  if (opts.playerHref) {
    const a = doc.createElement('a');
    a.className = 'emk-popout';
    a.href = opts.playerHref;
    a.innerHTML = icons.popout;
    a.setAttribute('aria-label', 'Open the player on its own page');
    a.title = 'Open the player on its own page';
    bar.append(a);
  }
  // The caption anchors to the host (light DOM always paints; stage hosts carry shadow roots
  // that would swallow it) and is geometrically pinned over the stage below.
  const pos = host.style.position || getComputedStyle(host).position;
  if (!pos || pos === 'static') host.style.position = 'relative';
  host.append(style, bar, cap);

  let lines: VoiceLine[] | null = null;
  let ccOn = false;
  let dead = false;
  let raf = 0;
  let last = '';
  let geoKey = '';
  const byScene = () => new Map((lines ?? []).map((l) => [l.scene, l.text]));

  // Pins the overlay caption over the stage (centered, 4% above its bottom edge). Geometry is
  // re-read only when the host size moves, never per frame.
  const placeCaption = () => {
    const key = `${host.clientWidth}x${host.clientHeight}`;
    if (key === geoKey) return;
    geoKey = key;
    const hr = host.getBoundingClientRect();
    const sr = opts.stage.getBoundingClientRect();
    cap.style.left = `${sr.left - hr.left + sr.width / 2}px`;
    cap.style.bottom = `${hr.bottom - sr.bottom + sr.height * 0.04}px`;
    cap.style.maxWidth = `${sr.width * 0.82}px`;
  };

  const render = () => {
    if (dead) return;
    placeCaption();
    const s = show.state;
    const scenes = show.timeline.scenes;
    const current = ticks(show);
    if (ticksEl.children.length !== scenes.length) {
      ticksEl.replaceChildren(
        ...scenes.map((sc, i) => {
          const b = doc.createElement('button');
          b.type = 'button';
          b.className = 'emk-tick';
          b.title = sc.name;
          b.setAttribute('aria-label', `Scene ${i + 1}: ${sc.name}`);
          b.onclick = () => show.go(i);
          return b;
        }),
      );
    }
    [...ticksEl.children].forEach((el, i) => {
      const t = current[i];
      const tick: ChromeTick = { id: t.id, name: t.name, dur: t.dur, fill: t.fill, done: i < s.index, current: i === s.index };
      const custom = opts.renderTick?.(tick, i);
      if (custom !== undefined) {
        if ((el as HTMLElement).dataset.custom !== custom) {
          el.innerHTML = custom;
          (el as HTMLElement).dataset.custom = custom;
        }
      } else {
        delete (el as HTMLElement).dataset.custom;
        let span = el.querySelector('span');
        if (!span) {
          el.innerHTML = '';
          span = doc.createElement('span');
          el.append(span);
        }
        span.style.width = `${Math.round(t.fill * 100)}%`;
      }
      el.classList.toggle('done', tick.done);
      el.toggleAttribute('aria-current', tick.current);
    });
    // The rest only moves on state changes, not every frame.
    // (show.state.index is always valid: go() wraps it, place() clamps it.)
    const line = byScene().get(scenes[s.index].id);
    const key = `${s.playing}|${s.sound}|${s.index}|${ccOn}|${line ?? ''}`;
    if (key === last) return;
    last = key;
    count.textContent = `${s.index + 1} / ${scenes.length}`;
    toggle.innerHTML = s.playing ? icons.pause : icons.play;
    toggle.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
    mute.innerHTML = s.sound ? icons.soundOn : icons.soundOff;
    mute.setAttribute('aria-pressed', String(s.sound));
    mute.setAttribute('aria-label', s.sound ? 'Sound off' : 'Sound on');
    cap.textContent = line ?? '';
    cap.hidden = !ccOn || !line;
  };
  // Tick fills follow the playhead every frame; state changes notify through the show.
  const loop = () => {
    if (dead) return;
    render();
    raf = requestAnimationFrame(loop);
  };

  prev.onclick = () => show.prev();
  next.onclick = () => show.next();
  toggle.onclick = () => (show.state.started ? show.toggle() : show.start());
  mute.onclick = () => show.setSound(!show.state.sound);
  cc.onclick = () => {
    ccOn = !ccOn;
    cc.setAttribute('aria-pressed', String(ccOn));
    render();
  };
  const syncFs = () => {
    fs.innerHTML = doc.fullscreenElement === host ? icons.fullscreenExit : icons.fullscreenEnter;
  };
  fs.onclick = () => {
    if (doc.fullscreenElement) doc.exitFullscreen?.();
    else host.requestFullscreen?.();
  };
  const onFs = () => syncFs();
  doc.addEventListener('fullscreenchange', onFs);
  const onKey = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const acts: Record<string, () => void> = {
      ' ': () => (show.state.started ? show.toggle() : show.start()),
      arrowright: () => show.next(),
      arrowleft: () => show.prev(),
      m: () => show.setSound(!show.state.sound),
      c: () => cc.click(),
      f: () => fs.click(),
    };
    if (!Object.hasOwn(acts, k)) return;
    e.preventDefault();
    e.stopPropagation();
    acts[k]();
  };
  host.addEventListener('keydown', onKey);

  const off = show.on(() => render());
  render();
  raf = requestAnimationFrame(loop);
  void voiceLines(opts.film, locale).then((l) => {
    if (dead) return;
    lines = l;
    if (!l?.length) cc.remove();
    else cc.setAttribute('aria-pressed', String(ccOn));
    render();
  });

  return {
    el: bar,
    destroy() {
      dead = true;
      off();
      cancelAnimationFrame(raf);
      host.removeEventListener('keydown', onKey);
      doc.removeEventListener('fullscreenchange', onFs);
      style.remove();
      bar.remove();
      cap.remove();
    },
  };
}
