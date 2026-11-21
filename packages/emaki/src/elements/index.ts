// Web components over the core, so every framework (or none) renders stories the same way:
//   <motion-scene film="phishing-101" scene="spot" layout="figure" locale="es"></motion-scene>   an article figure (loops)
//   <motion-show film="phishing-101" locale="es" layout="landscape"></motion-show>                 the story player
// A figure whose scene has a voice line gains a CC toggle and caption overlay; voice="off" cuts its narration
// (the score plays on). Both take mode="light|dark|auto" (default auto: follow the page's data-mode, else prefers-color-scheme).
// Call defineMotionElements() once, after useSource(...). Both elements fit their box; give them a width (and the
// show an aspect ratio). Sound is always off until the reader turns it on.
// The show renders the standard player chrome (toolbar plus captions) by default; chrome="off" keeps the bare
// stage for custom chrome, driven through the controller. `icons` and `renderTick` arrive as JS properties,
// the pop-out link as a playerhref attribute.
import { createShow, showKey, fontsReady, loadFilm, mountScene, sceneSound, descriptionFooter, mountPlayerChrome, DEFAULT_CHROME_ICONS, type Mounted, type Layout, type Mode, SIZES, type ChromeIconName, type ChromeTick, type PlayerChrome } from '../index.js';

const BTN = 'position:absolute;right:10px;bottom:10px;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.85);cursor:pointer;display:grid;place-items:center;color:#111';

/** The mode attribute: light, dark, or auto (the default: follow the page's data-mode, else the OS). */
const modeOf = (el: Element): Mode => (['light', 'dark'].includes(el.getAttribute('mode') ?? '') ? el.getAttribute('mode') as Mode : 'auto');

class MotionScene extends HTMLElement {
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

class MotionShow extends HTMLElement {
  static observedAttributes = ['film', 'locale', 'layout', 'mode', 'description', 'playerhref', 'chrome', 'voicetoggle'];
  #show: Awaited<ReturnType<typeof createShow>> | null = null; #ro?: ResizeObserver;
  #box = document.createElement('div');
  #chrome: PlayerChrome | null = null;
  #icons?: Partial<Record<ChromeIconName, string>>;
  #renderTick?: (tick: ChromeTick, index: number) => string | void;
  #foot: { el: HTMLElement; destroy: () => void } | null = null; #footKey = '';
  #gen = 0; #pending = 0;
  /** The description footer is on: a Description button under the player opens the voiceover script. */
  get #descOn() { return this.hasAttribute('description'); }
  /** The standard chrome is on unless chrome="off" (on is the default). */
  get #chromeOn() { return this.getAttribute('chrome') !== 'off'; }
  /** The box the stage fits: its own box when the bar or footer flows below it, else the whole element. */
  get #fitBox(): HTMLElement { return this.#descOn || this.#chromeOn ? this.#box : this; }
  /** Glyph overrides for the chrome (merged over DEFAULT_CHROME_ICONS); setting rebuilds the chrome. */
  set icons(v: Partial<Record<ChromeIconName, string>>) { this.#icons = v; this.#syncChrome(); }
  /** Custom tick HTML per scene (still seeks on click); setting rebuilds the chrome. */
  set renderTick(v: (tick: ChromeTick, index: number) => string | void) { this.#renderTick = v; this.#syncChrome(); }
  connectedCallback() {
    this.style.display ||= 'block'; this.style.position ||= 'relative';
    if (!this.#box.isConnected) this.append(this.#box);
    this.#layoutBox();
    this.#ro = new ResizeObserver(() => this.#show?.fit(this.#fitBox.clientWidth, this.#fitBox.clientHeight)); this.#ro.observe(this);
    this.tabIndex = 0;
    this.addEventListener('keydown', this.#key);
    this.#start();
    this.#syncFoot();
  }
  disconnectedCallback() { this.#ro?.disconnect(); this.#show?.destroy(); this.#chrome?.destroy(); this.#chrome = null; this.#foot?.destroy(); this.#foot = null; this.#footKey = ''; this.removeEventListener('keydown', this.#key); }
  attributeChangedCallback(name: string) {
    if (!this.isConnected) return;
    this.#layoutBox();
    if (name === 'playerhref' || name === 'chrome' || name === 'voicetoggle') return this.#syncChrome();
    // A layout change re-aspects the live show in place (the O key's path): the same controller, a new ratio.
    if (name === 'layout' && this.#show) {
      this.#show.setLayout((this.getAttribute('layout') as Layout) || 'landscape');
      this.#show.fit(this.#fitBox.clientWidth, this.#fitBox.clientHeight);
      return;
    }
    this.#syncFoot(); this.#start();
  }
  /** The controller (next/prev/play/pause/setSound/setLayout/seek/on), for custom chrome. */
  get controller() { return this.#show; }
  /** The stage box keeps the content aspect ratio for the current layout (SIZES): width-driven and capped by
   *  the shell's height, or height-driven and capped by the shell's width in portrait, margin auto centring it
   *  when a cap leaves gutters. The bar and footer flow below it. */
  #layoutBox() {
    const layout = (this.getAttribute('layout') as Layout) || 'landscape';
    const [W, H] = SIZES[layout];
    this.#box.style.cssText = layout === 'portrait'
      ? `position:relative;height:100%;aspect-ratio:${W}/${H};max-width:100%;margin:auto;overflow:hidden`
      : `position:relative;width:100%;aspect-ratio:${W}/${H};max-height:100%;margin:auto;overflow:hidden`;
  }
  /** The standard toolbar over the show (captions pinned over the stage box); order stays stage, bar, footer. */
  #syncChrome() {
    this.#chrome?.destroy(); this.#chrome = null;
    const show = this.#show;
    if (show && this.#chromeOn) {
      this.#chrome = mountPlayerChrome(this, show, {
        film: show.film.slug, locale: this.getAttribute('locale') || 'en', stage: this.#box,
        playerHref: this.getAttribute('playerhref') || undefined, icons: this.#icons, renderTick: this.#renderTick,
        voiceToggle: this.getAttribute('voicetoggle') !== 'off',
      });
      if (this.#foot) this.append(this.#foot.el);
    }
  }
  /** The description footer for the current film and locale; a footer a newer call overtook is dropped. */
  async #syncFoot() {
    const slug = this.getAttribute('film'), key = this.#descOn && slug ? `${slug}|${this.getAttribute('locale') || 'en'}` : '';
    if (key === this.#footKey) return;
    this.#footKey = key;
    this.#foot?.destroy(); this.#foot = null;
    if (!key) return;
    const f = await descriptionFooter(slug!, { locale: this.getAttribute('locale') || 'en' });
    if (this.#footKey !== key) return;   // overtook while loading; its panel never went up, so nothing to undo
    this.#foot = f;
    if (f) this.append(f.el);
  }
  async #start() {
    // Overlapping starts: the newest call wins. A superseded show is destroyed; when it had mounted last its
    // destroy empties the host while nothing else is in flight (#pending counts this call), so start over.
    const token = ++this.#gen;
    const slug = this.getAttribute('film');
    if (!slug) return;
    this.#show?.destroy();
    this.#chrome?.destroy(); this.#chrome = null;
    this.#pending++;
    try {
      const show = await createShow(this.#box, slug, { locale: this.getAttribute('locale') || 'en', layout: (this.getAttribute('layout') as Layout) || 'landscape', mode: modeOf(this) });
      if (token !== this.#gen) {
        show.destroy();
        if (!this.#box.shadowRoot?.querySelector('#stage') && this.#pending === 1) this.#start();
        return;
      }
      this.#show = show;
      this.#show.fit(this.#fitBox.clientWidth, this.#fitBox.clientHeight);
      this.#show.on((s) => this.dispatchEvent(new CustomEvent('showchange', { detail: s })));
      this.#syncChrome();
    } finally { this.#pending--; }
  }
  #key = (e: KeyboardEvent) => {
    if (!this.#show) return;
    // The mounted chrome owns its keys (Space, arrows, M, C, F stop there); the element keeps O/R/Home.
    if (this.#chrome && !['o', 'r', 'home'].includes(e.key.toLowerCase())) return;
    if (showKey(this.#show, e, this)) e.preventDefault();
  };
}

export function defineMotionElements() {
  if (!customElements.get('motion-scene')) customElements.define('motion-scene', MotionScene);
  if (!customElements.get('motion-show')) customElements.define('motion-show', MotionShow);
}
