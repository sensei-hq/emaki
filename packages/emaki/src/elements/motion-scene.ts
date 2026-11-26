// <motion-scene film="phishing-101" scene="spot" layout="figure" locale="es"></motion-scene>: an article
// figure (loops). A figure whose scene has a voice line gains a CC toggle and caption overlay;
// voice="off" cuts its narration (the score plays on). Takes mode="light|dark|auto" (default auto).
import { DEFAULT_CHROME_ICONS, fontsReady, loadFilm, mountScene, sceneSound, SIZES, type Layout, type Mode, type Mounted } from '../index.js';
import { modeOf } from './attrs.js';

const BTN = 'position:absolute;right:10px;bottom:10px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.85);cursor:pointer;display:grid;place-items:center;color:#111';

export class MotionScene extends HTMLElement {
  static observedAttributes = ['film', 'scene', 'layout', 'locale', 'mode', 'voice'];
  #m: Mounted | null = null; #raf = 0; #t = 0; #last = 0; #ro?: ResizeObserver; #io?: IntersectionObserver; #visible = false; #gen = 0;
  #box = document.createElement('div'); #btn = document.createElement('button');
  #cc = document.createElement('button'); #cap = document.createElement('p'); #ccOn = false;
  #sound: ReturnType<typeof sceneSound> | null = null;
  connectedCallback() {
    this.style.display ||= 'block'; this.style.position ||= 'relative';
    if (!this.#box.isConnected) {
      this.#box.style.cssText = 'position:relative;width:100%;overflow:hidden';
      this.#btn.style.cssText = BTN; this.#btn.hidden = true; this.#btn.className = 'emk-scene-sound';
      this.#soundIcon(false);
      this.#btn.onclick = () => this.#toggleSound();
      this.#cc.style.cssText = BTN.replace('right:10px', 'right:54px'); this.#cc.className = 'emk-scene-cc';
      this.#cc.innerHTML = DEFAULT_CHROME_ICONS.cc;
      this.#cc.setAttribute('aria-label', 'Captions');
      this.#cc.setAttribute('aria-pressed', 'false');
      this.#cc.onclick = () => this.#toggleCc();
      this.#cap.className = 'emk-scene-cap';
      this.#cap.setAttribute('aria-live', 'polite');
      this.#cap.hidden = true;
      this.#cap.style.cssText = 'position:absolute;left:50%;bottom:12%;transform:translateX(-50%);max-width:82%;margin:0;padding:.45em .9em;border-radius:.4rem;background:rgb(17 27 42/.82);color:#fff;font:clamp(.85rem,1.6vw,1.25rem)/1.4 system-ui;text-align:center';
      const style = document.createElement('style');
      style.textContent = '.emk-scene-sound svg,.emk-scene-cc svg{width:20px;height:20px;fill:currentColor}';
      this.append(this.#box, this.#btn, style);
    }
    this.#ro = new ResizeObserver(() => this.#fit()); this.#ro.observe(this);
    this.#io = new IntersectionObserver(([e]) => { this.#visible = e.isIntersecting; if (!this.#visible) this.#stopSound(); }, { threshold: 0.2 });
    this.#io.observe(this);
    this.#mount();
  }
  disconnectedCallback() { cancelAnimationFrame(this.#raf); this.#ro?.disconnect(); this.#io?.disconnect(); this.#sound?.destroy(); this.#sound = null; this.#m?.destroy(); }
  attributeChangedCallback(name: string) {
    if (!this.isConnected) return;
    if (name === 'voice') return this.#syncVoice();
    this.#mount();
  }
  get layout(): Layout { return (this.getAttribute('layout') as Layout) || 'figure'; }
  /** The voice cut from markup: voice="off" cuts the figure's narration, anything else (or nothing) sounds it. */
  get #voiceOn() { return this.getAttribute('voice') !== 'off'; }
  async #mount() {
    // Overlapping mounts (upgrade fires one per attribute, plus connectedCallback): the newest call wins, the
    // rest return. The pre-call check has no await after it, so a superseded mount never reaches mountScene().
    const token = ++this.#gen;
    const slug = this.getAttribute('film'), id = this.getAttribute('scene'), locale = this.getAttribute('locale') || 'en';
    if (!slug || !id) return;
    const f = await loadFilm(slug, locale);
    if (!f) return;
    await fontsReady(f);
    if (token !== this.#gen) return;
    this.#m?.destroy();
    const m = await mountScene(this.#box, f, id, this.layout, { locale, mode: modeOf(this) });
    if (token !== this.#gen) { m.destroy(); return; }
    this.#m = m;
    // The scene's score slice and narration (sceneSound); a new film, scene or language starts it over, off.
    this.#sound?.destroy();
    const sound = (this.#sound = sceneSound(slug, id, locale));
    sound.setVoice(this.#voiceOn);
    this.#soundIcon(false);
    this.#btn.hidden = !(await sound.available);
    const line = await sound.caption;
    if (token !== this.#gen) return;
    this.#syncCaption(line);
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
  /** The speaker glyph from the standard chrome set: off (Sound on) or on (Sound off). */
  #soundIcon(on: boolean) {
    this.#btn.innerHTML = on ? DEFAULT_CHROME_ICONS.soundOn : DEFAULT_CHROME_ICONS.soundOff;
    this.#btn.setAttribute('aria-label', on ? 'Sound off' : 'Sound on');
  }
  /** The scene's caption line, when it has one: the CC toggle and overlay go up (both start off), else neither renders. */
  #syncCaption(line: string | null) {
    if (!line) { this.#cc.remove(); this.#cap.remove(); return; }
    this.#cap.textContent = line;
    this.#ccOn = false;
    this.#cc.setAttribute('aria-pressed', 'false');
    this.#cap.hidden = true;
    this.append(this.#cc, this.#cap);
  }
  #toggleCc() {
    this.#ccOn = !this.#ccOn;
    this.#cc.setAttribute('aria-pressed', String(this.#ccOn));
    this.#cap.hidden = !this.#ccOn;
  }
  /** A voice-attribute flip reaches the live figure sound (a sounding take resumes on the way back on). */
  #syncVoice() {
    const s = this.#sound;
    if (!s) return;
    s.setVoice(this.#voiceOn);
    if (this.#voiceOn) void s.cue(Math.min(this.#t, this.#m!.dur));
  }
  #stopSound() { if (this.#sound?.on) this.#sound.toggle(); this.#soundIcon(false); }
  #toggleSound() {
    if (!this.#sound) return;
    if (this.#sound.on) return this.#stopSound();
    this.#soundIcon(true);
    // The sound is made right after the scene mounts, so a scene is always there by now.
    this.#sound.toggle(Math.min(this.#t, this.#m!.dur));
  }
}
