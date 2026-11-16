// Web components over the core, so every framework (or none) renders stories the same way:
//   <motion-scene film="phishing-101" scene="spot" layout="figure" locale="es"></motion-scene>   an article figure (loops)
//   <motion-show film="phishing-101" locale="es" layout="landscape"></motion-show>                 the story player
// Call defineMotionElements() once, after useSource(...). Both elements fit their box; give them a width (and the
// show an aspect ratio). Sound is always off until the reader turns it on.
import { createShow, filmScore, fontsReady, loadFilm, mountScene, playScore as play, timeline, type Mounted, type Layout, SIZES } from '../index.js';

const BTN = 'position:absolute;right:10px;bottom:10px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.85);cursor:pointer;font:16px system-ui';

class MotionScene extends HTMLElement {
  static observedAttributes = ['film', 'scene', 'layout', 'locale'];
  #m: Mounted | null = null; #raf = 0; #t = 0; #last = 0; #ro?: ResizeObserver; #io?: IntersectionObserver; #visible = false;
  #box = document.createElement('div'); #btn = document.createElement('button');
  #ctx: AudioContext | null = null; #voice: { stop: () => void } | null = null; #start = 0;
  connectedCallback() {
    this.style.display ||= 'block'; this.style.position ||= 'relative';
    if (!this.#box.isConnected) {
      this.#box.style.cssText = 'position:relative;width:100%;overflow:hidden';
      this.#btn.style.cssText = BTN; this.#btn.textContent = '🔈'; this.#btn.setAttribute('aria-label', 'Sound on');
      this.#btn.onclick = () => this.#toggleSound();
      this.append(this.#box, this.#btn);
    }
    this.#ro = new ResizeObserver(() => this.#fit()); this.#ro.observe(this);
    this.#io = new IntersectionObserver(([e]) => { this.#visible = e.isIntersecting; if (!this.#visible) this.#stopSound(); }, { threshold: 0.2 });
    this.#io.observe(this);
    this.#mount();
  }
  disconnectedCallback() { cancelAnimationFrame(this.#raf); this.#ro?.disconnect(); this.#io?.disconnect(); this.#stopSound(); this.#ctx?.close(); this.#m?.destroy(); }
  attributeChangedCallback() { if (this.isConnected) this.#mount(); }
  get layout(): Layout { return (this.getAttribute('layout') as Layout) || 'figure'; }
  async #mount() {
    const slug = this.getAttribute('film'), id = this.getAttribute('scene'), locale = this.getAttribute('locale') || 'en';
    if (!slug || !id) return;
    const f = await loadFilm(slug, locale);
    if (!f) return;
    await fontsReady(f);
    this.#m?.destroy();
    this.#m = await mountScene(this.#box, f, id, this.layout, { locale });
    this.#start = timeline(f).scenes.find((s) => s.id === id)!.start;
    this.#btn.hidden = !(await filmScore(f));
    this.#fit();
    cancelAnimationFrame(this.#raf); this.#last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - this.#last) / 1000); this.#last = now;
      if (this.#visible && this.#m) {
        this.#t += dt;
        if (this.#t > this.#m.dur + 1.2) { this.#t = 0; if (this.#voice) this.#playSound(); }   // loop with a short rest
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
  async #playSound() {
    const slug = this.getAttribute('film')!, f = await loadFilm(slug, this.getAttribute('locale') || 'en'), score = f && (await filmScore(f));
    if (!score || !this.#m) return;
    this.#ctx ??= new AudioContext(); await this.#ctx.resume();
    this.#voice?.stop();
    const from = this.#start + this.#t, to = this.#start + this.#m.dur;
    this.#voice = play(this.#ctx, this.#ctx.destination, score, from, to, this.#ctx.currentTime + 0.05, to + 1);
  }
  #stopSound() { this.#voice?.stop(); this.#voice = null; this.#btn.textContent = '🔈'; }
  #toggleSound() { if (this.#voice) this.#stopSound(); else { this.#btn.textContent = '🔊'; this.#playSound(); } }
}

class MotionShow extends HTMLElement {
  static observedAttributes = ['film', 'locale', 'layout'];
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
    this.#show = await createShow(this.#box, slug, { locale: this.getAttribute('locale') || 'en', layout: (this.getAttribute('layout') as Layout) || 'landscape' });
    this.#show.fit(this.clientWidth, this.clientHeight);
    this.#show.on((s) => this.dispatchEvent(new CustomEvent('showchange', { detail: s })));
  }
  #key = (e: KeyboardEvent) => {
    const s = this.#show; if (!s) return;
    if (e.key === 'ArrowRight') s.next(); else if (e.key === 'ArrowLeft') s.prev();
    else if (e.key === ' ') { s.toggle(); e.preventDefault(); } else if (e.key.toLowerCase() === 'm') s.setSound(!s.state.sound);
    else if (e.key.toLowerCase() === 'o') s.setLayout(s.state.layout === 'landscape' ? 'portrait' : 'landscape');
  };
}

export function defineMotionElements() {
  if (!customElements.get('motion-scene')) customElements.define('motion-scene', MotionScene);
  if (!customElements.get('motion-show')) customElements.define('motion-show', MotionShow);
}
