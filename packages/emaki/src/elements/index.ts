// Web components over the core, so every framework (or none) renders stories the same way:
//   <motion-scene film="phishing-101" scene="spot" layout="figure" locale="es"></motion-scene>   an article figure (loops)
//   <motion-show film="phishing-101" locale="es" layout="landscape"></motion-show>                 the story player
// Both take mode="light|dark|auto" (default auto: follow the page's data-mode, else prefers-color-scheme).
// Call defineMotionElements() once, after useSource(...). Both elements fit their box; give them a width (and the
// show an aspect ratio). Sound is always off until the reader turns it on.
import { createShow, showKey, fontsReady, loadFilm, mountScene, sceneSound, type Mounted, type Layout, type Mode, SIZES } from '../index.js';

const BTN = 'position:absolute;right:10px;bottom:10px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.85);cursor:pointer;font:16px system-ui';

/** The mode attribute: light, dark, or auto (the default: follow the page's data-mode, else the OS). */
const modeOf = (el: Element): Mode => (['light', 'dark'].includes(el.getAttribute('mode') ?? '') ? el.getAttribute('mode') as Mode : 'auto');

class MotionScene extends HTMLElement {
  static observedAttributes = ['film', 'scene', 'layout', 'locale', 'mode'];
  #m: Mounted | null = null; #raf = 0; #t = 0; #last = 0; #ro?: ResizeObserver; #io?: IntersectionObserver; #visible = false;
  #box = document.createElement('div'); #btn = document.createElement('button');
  #sound: ReturnType<typeof sceneSound> | null = null;
  connectedCallback() {
    this.style.display ||= 'block'; this.style.position ||= 'relative';
    if (!this.#box.isConnected) {
      this.#box.style.cssText = 'position:relative;width:100%;overflow:hidden';
      this.#btn.style.cssText = BTN; this.#btn.hidden = true; this.#btn.textContent = '🔈'; this.#btn.setAttribute('aria-label', 'Sound on');
      this.#btn.onclick = () => this.#toggleSound();
      this.append(this.#box, this.#btn);
    }
    this.#ro = new ResizeObserver(() => this.#fit()); this.#ro.observe(this);
    this.#io = new IntersectionObserver(([e]) => { this.#visible = e.isIntersecting; if (!this.#visible) this.#stopSound(); }, { threshold: 0.2 });
    this.#io.observe(this);
    this.#mount();
  }
  disconnectedCallback() { cancelAnimationFrame(this.#raf); this.#ro?.disconnect(); this.#io?.disconnect(); this.#sound?.destroy(); this.#sound = null; this.#m?.destroy(); }
  attributeChangedCallback() { if (this.isConnected) this.#mount(); }
  get layout(): Layout { return (this.getAttribute('layout') as Layout) || 'figure'; }
  async #mount() {
    const slug = this.getAttribute('film'), id = this.getAttribute('scene'), locale = this.getAttribute('locale') || 'en';
    if (!slug || !id) return;
    const f = await loadFilm(slug, locale);
    if (!f) return;
    await fontsReady(f);
    this.#m?.destroy();
    this.#m = await mountScene(this.#box, f, id, this.layout, { locale, mode: modeOf(this) });
    // The scene's score slice and narration (sceneSound); a new film, scene or language starts it over, off.
    this.#sound?.destroy();
    const sound = (this.#sound = sceneSound(slug, id, locale));
    this.#btn.textContent = '🔈'; this.#btn.setAttribute('aria-label', 'Sound on');
    this.#btn.hidden = !(await sound.available);
    this.#fit();
    cancelAnimationFrame(this.#raf); this.#last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - this.#last) / 1000); this.#last = now;
      if (this.#visible && this.#m) {
        this.#t += dt;
        if (this.#t > this.#m.dur + 1.2) { this.#t = 0; if (this.#sound?.on) this.#sound.cue(0); }   // loop with a short rest
        this.#m.render(Math.min(this.#t, this.#m.dur - 1e-3));
      }
      this.#raf = requestAnimationFrame(tick);
    };
    this.#raf = requestAnimationFrame(tick);
  }
  #fit() {
    const [W, H] = SIZES[this.layout], w = this.clientWidth || W, s = w / W;
    this.#box.style.height = `${H * s}px`;
    if (this.#m) this.#m.stage.style.transform = `scale(${s})`;
  }
  #stopSound() { if (this.#sound?.on) this.#sound.toggle(); this.#btn.textContent = '🔈'; this.#btn.setAttribute('aria-label', 'Sound on'); }
  #toggleSound() {
    if (!this.#sound) return;
    if (this.#sound.on) return this.#stopSound();
    this.#btn.textContent = '🔊'; this.#btn.setAttribute('aria-label', 'Sound off');
    // The sound is made right after the scene mounts, so a scene is always there by now.
    this.#sound.toggle(Math.min(this.#t, this.#m!.dur));
  }
}

class MotionShow extends HTMLElement {
  static observedAttributes = ['film', 'locale', 'layout', 'mode'];
  #show: Awaited<ReturnType<typeof createShow>> | null = null; #ro?: ResizeObserver;
  #box = document.createElement('div');
  connectedCallback() {
    this.style.display ||= 'block'; this.style.position ||= 'relative';
    if (!this.#box.isConnected) { this.#box.style.cssText = 'position:absolute;inset:0;overflow:hidden'; this.append(this.#box); }
    this.#ro = new ResizeObserver(() => this.#show?.fit(this.clientWidth, this.clientHeight)); this.#ro.observe(this);
    this.tabIndex = 0;
    this.addEventListener('keydown', this.#key);
    this.#start();
  }
  disconnectedCallback() { this.#ro?.disconnect(); this.#show?.destroy(); this.removeEventListener('keydown', this.#key); }
  attributeChangedCallback() { if (this.isConnected) this.#start(); }
  /** The controller (next/prev/play/pause/setSound/setLayout/seek/on), for custom chrome. */
  get controller() { return this.#show; }
  async #start() {
    const slug = this.getAttribute('film');
    if (!slug) return;
    this.#show?.destroy();
    this.#show = await createShow(this.#box, slug, { locale: this.getAttribute('locale') || 'en', layout: (this.getAttribute('layout') as Layout) || 'landscape', mode: modeOf(this) });
    this.#show.fit(this.clientWidth, this.clientHeight);
    this.#show.on((s) => this.dispatchEvent(new CustomEvent('showchange', { detail: s })));
  }
  #key = (e: KeyboardEvent) => { if (this.#show && showKey(this.#show, e, this)) e.preventDefault(); };
}

export function defineMotionElements() {
  if (!customElements.get('motion-scene')) customElements.define('motion-scene', MotionScene);
  if (!customElements.get('motion-show')) customElements.define('motion-show', MotionShow);
}
