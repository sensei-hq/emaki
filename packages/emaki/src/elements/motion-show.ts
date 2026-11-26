// <motion-show film="phishing-101" locale="es" layout="landscape"></motion-show>: the story player. It
// renders the standard player chrome (toolbar plus captions) by default; chrome="off" keeps the bare
// stage for custom chrome, driven through the controller. `icons` and `renderTick` arrive as JS
// properties, the pop-out link as a playerhref attribute. Takes mode="light|dark|auto" (default auto).
import { createShow, descriptionFooter, mountPlayerChrome, showKey, SIZES, type ChromeIconName, type ChromeTick, type Layout, type Mode, type PlayerChrome } from '../index.js';
import { modeOf } from './attrs.js';

export class MotionShow extends HTMLElement {
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
