// The player chrome's DOM: building the toolbar and caption overlay, and painting them from the
// show each frame (tick fills) and on state changes (transport, toggles, count, captions). The mount
// in ./player-chrome.js owns the wiring and the frame loop; this module only builds and paints.
import { ticks, type Show } from './show.js';
import type { VoiceLine } from './types.js';
import type { ChromeIconName, ChromeTick, PlayerChromeOptions } from './player-chrome.js';

/** Every element of a mounted chrome, built once by buildChromeBar. */
export interface ChromeElements {
  style: HTMLStyleElement;
  bar: HTMLDivElement;
  cap: HTMLParagraphElement;
  prev: HTMLButtonElement;
  toggle: HTMLButtonElement;
  next: HTMLButtonElement;
  ticksEl: HTMLDivElement;
  count: HTMLSpanElement;
  cc: HTMLButtonElement;
  mute: HTMLButtonElement;
  vo: HTMLButtonElement | null;
  fs: HTMLButtonElement;
}

/** What the paint functions remember between renders: voice lines, the CC toggle, and the last keys. */
export interface ChromeState {
  lines: VoiceLine[] | null;
  ccOn: boolean;
  dead: boolean;
  last: string;
  geoKey: string;
}

/** Structural styles for the chrome (inherits color and font from the page). Injected once per host. */
export const CHROME_CSS = [
  '.emk-bar{display:flex;align-items:center;gap:8px;padding:8px;font:13px system-ui}',
  '.emk-bar button,.emk-bar a{display:grid;place-items:center;min-width:34px;height:34px;border-radius:8px;border:0;background:none;color:inherit;cursor:pointer;padding:0 6px;text-decoration:none}',
  '.emk-bar button:hover,.emk-bar a:hover{background:color-mix(in srgb,currentColor 12%,transparent)}',
  '.emk-bar button[aria-pressed="true"]{background:color-mix(in srgb,currentColor 22%,transparent)}',
  '.emk-bar button:disabled{opacity:.35;cursor:default;background:none}',
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

/** Builds the toolbar and caption overlay (unattached): transport, ticks, count, toggles, fullscreen. */
export function buildChromeBar(doc: Document, icons: Record<ChromeIconName, string>, opts: PlayerChromeOptions): ChromeElements {
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
  const vo = opts.voiceToggle === false ? null : btn(doc, 'emk-voice', icons.voice, 'Voice on', 'Voice (V)');
  vo?.setAttribute('aria-pressed', 'true');
  const fs = btn(doc, 'emk-fs', icons.fullscreenEnter, 'Full screen', 'Full screen (F)');
  bar.append(prev, toggle, next, ticksEl, count, cc, mute, ...(vo ? [vo] : []), fs);
  if (opts.playerHref) {
    const a = doc.createElement('a');
    a.className = 'emk-popout';
    a.href = opts.playerHref;
    a.innerHTML = icons.popout;
    a.setAttribute('aria-label', 'Open the player on its own page');
    a.title = 'Open the player on its own page';
    bar.append(a);
  }
  return { style, bar, cap, prev, toggle, next, ticksEl, count, cc, mute, vo, fs };
}

// Pins the overlay caption over the stage (centered, 4% above its bottom edge). Geometry is
// re-read only when the host size moves, never per frame.
export function placeCaption(host: HTMLElement, stage: HTMLElement, cap: HTMLParagraphElement, state: ChromeState): void {
  const key = `${host.clientWidth}x${host.clientHeight}`;
  if (key === state.geoKey) return;
  state.geoKey = key;
  const hr = host.getBoundingClientRect();
  const sr = stage.getBoundingClientRect();
  cap.style.left = `${sr.left - hr.left + sr.width / 2}px`;
  cap.style.bottom = `${hr.bottom - sr.bottom + sr.height * 0.04}px`;
  cap.style.maxWidth = `${sr.width * 0.82}px`;
}

/** Rebuilds the per-scene tick buttons when the scene list changed (seek on click). */
export function syncTickButtons(doc: Document, ticksEl: HTMLDivElement, show: Show): void {
  const scenes = show.timeline.scenes;
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
}

/** Paints every tick's fill from the playhead (custom tick HTML when renderTick returns it). */
export function paintTicks(doc: Document, ticksEl: HTMLDivElement, show: Show, renderTick: PlayerChromeOptions['renderTick']): void {
  const s = show.state;
  const current = ticks(show);
  [...ticksEl.children].forEach((el, i) => {
    const t = current[i];
    const tick: ChromeTick = { id: t.id, name: t.name, dur: t.dur, fill: t.fill, done: i < s.index, current: i === s.index };
    const custom = renderTick?.(tick, i);
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
}

/** Paints what only moves on state changes (count, transport glyph, toggles, captions), not every frame. */
// (show.state.index is always valid: go() wraps it, place() clamps it.)
export function paintState(els: ChromeElements, show: Show, icons: Record<ChromeIconName, string>, state: ChromeState): void {
  const s = show.state;
  const scenes = show.timeline.scenes;
  const line = new Map((state.lines ?? []).map((l) => [l.scene, l.text])).get(scenes[s.index].id);
  const key = `${s.playing}|${s.sound}|${s.voiceOn}|${s.index}|${state.ccOn}|${line ?? ''}`;
  if (key === state.last) return;
  state.last = key;
  els.count.textContent = `${s.index + 1} / ${scenes.length}`;
  els.toggle.innerHTML = s.playing ? icons.pause : icons.play;
  els.toggle.setAttribute('aria-label', s.playing ? 'Pause' : 'Play');
  els.mute.innerHTML = s.sound ? icons.soundOn : icons.soundOff;
  els.mute.setAttribute('aria-pressed', String(s.sound));
  els.mute.setAttribute('aria-label', s.sound ? 'Sound off' : 'Sound on');
  if (els.vo) {
    els.vo.innerHTML = s.voiceOn ? icons.voice : icons.voiceOff;
    els.vo.setAttribute('aria-pressed', String(s.voiceOn));
    els.vo.setAttribute('aria-label', s.voiceOn ? 'Voice on' : 'Voice off');
    // Mute is the master: the VO toggle dims while sound is off (its cut still shown), so the bar
    // never claims speech is live that cannot be heard.
    els.vo.toggleAttribute('disabled', !s.sound);
  }
  els.cap.textContent = line ?? '';
  els.cap.hidden = !state.ccOn || !line;
}
