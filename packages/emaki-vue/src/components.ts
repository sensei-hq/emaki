// Vue 3 components over @senseihq/emaki, written as render functions so they need no SFC compiler.
// Client-only (they need the DOM): in Nuxt wrap them in <ClientOnly>. Call setupMotion(...) once on the client first.
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch, type PropType } from 'vue';
import { attachScene, figurePlayer, installCapture, sceneSound, showKey, type AttachedScene, type Layout, type Mode, type PlayerChromeOptions, type ScenePlayerState } from '@senseihq/emaki';
import { controlledToggle, useScenePlayer, useSize, type Show } from './composables.js';
import { useShowChrome } from './show-chrome.js';
import { useDescriptionLines, useShowStarter } from './show-lifecycle.js';
import { descriptionBlock, showFitStyle, stageChild } from './show-view.js';

function attach(player: () => ScenePlayerState, locale: () => string, mode: () => Mode, autoplay: boolean) {
  const box = ref<HTMLElement | null>(null), host = ref<HTMLElement | null>(null);
  const size = useSize(box);
  let view: AttachedScene | null = null;
  onMounted(() => { view = attachScene(host.value!, player(), { locale: locale(), mode: mode(), autoplay }); });
  onBeforeUnmount(() => view?.destroy());
  watch(locale, (l) => view?.setLocale(l));
  watch(mode, (m) => view?.setMode(m));
  watch(size, (s) => { if (s.w) view?.fit(s.w); });
  return { box, host };
}

/** An article figure: one scene, looping while it is on screen. While CC is on, a caption overlay shows the
 *  scene's voice line (no caption UI without one). `sound` and `voice` are app-driven inputs — figures have no
 *  speaker or voice toggle of their own, the voice is cut app-wide from the show's chrome — and `cc` may be
 *  app-driven too; every CC press emits `update:cc`, and undefined props keep per-instance behavior. */
export const MotionScene = defineComponent({
  name: 'MotionScene',
  props: {
    film: { type: String, required: true },
    scene: { type: String, required: true },
    layout: { type: String as PropType<Layout>, default: 'figure' },
    locale: { type: String, default: 'en' },
    mode: { type: String as PropType<Mode>, default: 'auto' },
    autoplay: { type: Boolean, default: true },
    /** Controlled sound: a defined value drives the figure's sound (silent until the app says so). */
    sound: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    /** Controlled captions: a defined value shows or hides the overlay; undefined leaves it to the CC toggle. */
    cc: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    /** Controlled voice: a defined value cuts or restores the figure's narration; undefined leaves it on. */
    voice: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  },
  emits: { 'update:cc': (_on: boolean) => true },
  setup(props, { emit }) {
    const player = figurePlayer({ film: props.film, scene: props.scene, layout: props.layout });
    watch(() => [props.film, props.scene, props.layout] as const, ([film, scene, layout]) => player.load({ film, scene, layout }));
    const { box, host } = attach(() => player, () => props.locale, () => props.mode, props.autoplay);
    // The figure's sound: its slice of the score plus its narration. The voice drive runs first, so a figure
    // told to sound with its voice cut starts on the score alone.
    let snd = sceneSound(props.film, props.scene, props.locale);
    onBeforeUnmount(() => snd.destroy());
    const driveSound = () => { const on = props.sound; if (on !== undefined && on !== snd.on) void snd.toggle(); };
    const driveVoice = () => { const on = props.voice; if (on !== undefined) snd.setVoice(on); };
    const line = shallowRef<string | null>(null);
    const loadCaption = async () => { line.value = await snd.caption; };
    void loadCaption();
    watch(() => props.voice, driveVoice, { immediate: true });
    watch(() => props.sound, driveSound, { immediate: true });
    watch([() => props.film, () => props.scene], ([film, scene]) => {
      snd.destroy();
      snd = sceneSound(film, scene, props.locale);
      driveVoice();
      driveSound();
      void loadCaption();
    });
    watch(() => props.locale, (l) => { snd.setLocale(l); void loadCaption(); });
    const ccOn = ref(false);
    const ccShown = computed(() => props.cc ?? ccOn.value);
    const toggleCc = () => {
      const next = !ccShown.value;
      controlledToggle(props.cc, next, (on) => emit('update:cc', on), () => { ccOn.value = next; });
    };
    return () => h('div', { ref: box, class: 'motion-scene', style: 'position:relative;width:100%' }, [
      h('div', { ref: host }),
      line.value === null ? null : h('button', {
        class: 'emk-scene-cc', 'aria-label': 'Captions', 'aria-pressed': String(ccShown.value), title: 'Captions',
        style: 'position:absolute;left:10px;bottom:10px;min-width:34px;height:34px;padding:0 8px;border-radius:8px;border:1px solid rgb(255 255 255/0.3);background:rgb(20 18 15/0.7);color:#fff;cursor:pointer;font:12px system-ui',
        onClick: toggleCc,
      }, 'CC'),
      line.value === null ? null : h('p', {
        class: 'emk-scene-cap', 'aria-live': 'polite', hidden: !ccShown.value,
        style: 'position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:82%;margin:0;padding:.45em .9em;border-radius:.4rem;background:rgb(17 27 42/.82);color:#fff;font:clamp(.85rem,1.6vw,1.25rem)/1.4 system-ui;text-align:center',
      }, line.value),
    ]);
  },
});

/** A scene driven by a ScenePlayerState you own (editors, previews, step-throughs). */
export const ScenePlayer = defineComponent({
  name: 'ScenePlayer',
  props: {
    player: { type: Object as PropType<ScenePlayerState>, required: true },
    locale: { type: String, default: 'en' },
    mode: { type: String as PropType<Mode>, default: 'auto' },
    controls: { type: Boolean, default: false },
  },
  setup(props) {
    const player = () => toRaw(props.player);
    const st = useScenePlayer(player());
    const { box, host } = attach(player, () => props.locale, () => props.mode, false);
    const msg = 'position:absolute;inset:0;display:grid;place-items:center;margin:0;font:14px system-ui';
    return () => {
      const s = st.value, p = player();
      return h('div', { ref: box, style: 'position:relative;width:100%' }, [
        h('div', { ref: host }),
        s.status === 'error' ? h('p', { role: 'alert', style: msg + ';color:#b42318' }, s.error) : null,
        s.status === 'idle' ? h('p', { style: msg + ';opacity:.7' }, 'Loading the scene…') : null,
        props.controls && s.status === 'ready'
          ? h('div', { style: 'display:flex;align-items:center;gap:12px;margin-top:10px;font:12px ui-monospace,monospace' }, [
              h('button', { onClick: () => p.toggle(), 'aria-label': s.playing ? 'Pause' : 'Play' }, s.playing ? '❚❚' : '▶'),
              h('input', { type: 'range', 'aria-label': 'Seek', min: 0, max: s.dur, step: 0.05, value: s.t, style: 'flex:1',
                onInput: (e: Event) => p.seek(Number((e.target as HTMLInputElement).value)) }),
              h('span', `${s.t.toFixed(1)} / ${s.dur.toFixed(1)}`),
            ])
          : null,
      ]);
    };
  },
});

/** The story player: a film's scenes as slides, fitted to its box. Keys: ←/→ scene, Space play/pause, M sound,
 *  O orientation, R replay, Home from the top, F fullscreen. `poster` opens on the cover frame; `cover` paints an
 *  image and creates nothing until the first click. */
export const MotionShow = defineComponent({
  name: 'MotionShow',
  props: {
    film: { type: String, required: true },
    locale: { type: String, default: 'en' },
    layout: { type: String as PropType<Layout>, default: 'landscape' },
    mode: { type: String as PropType<Mode>, default: 'auto' },
    controls: { type: Boolean, default: true },
    slide: { type: Number, default: 1 },
    loop: { type: Boolean, default: false },
    /** Open on the film's cover frame with a play button; the first click plays it from the top with sound on. */
    poster: { type: Boolean, default: false },
    /** An image (URL) to show with the play button; the show is created on the first click (then plays, sound on). */
    cover: { type: String, default: '' },
    /** The film's name and running time, for the play button's label and chip. */
    title: { type: String, default: '' },
    length: { type: String, default: '' },
    /** Where the pop-out link goes (the standalone player page, e.g. /show/<film>); an alias kept for playerHref. */
    fullscreenHref: { type: String, default: '' },
    /** Where the pop-out link goes; fullscreenHref stays as an alias when this is absent. No link when both are empty. */
    playerHref: { type: String, default: '' },
    /** Glyph overrides for the chrome, merged over the core's defaults (complete <svg> strings). */
    icons: { type: Object as PropType<PlayerChromeOptions['icons']>, default: undefined },
    /** Custom tick HTML per scene (still seeks on click); void keeps the default progress tick. */
    renderTick: { type: Function as PropType<PlayerChromeOptions['renderTick']>, default: undefined },
    /** A Description button under the player that opens the film's voiceover script; hidden without one. */
    description: { type: Boolean, default: false },
    /** Show the VO toggle (default true); false leaves mute as the single master control. */
    voiceToggle: { type: Boolean, default: true },
    /** Controlled sound: a defined value drives mute (the app's state wins over the toggle); undefined stays per-instance. */
    sound: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    /** Controlled captions: a defined value shows or hides the caption overlay; undefined leaves it to the CC toggle. */
    cc: { type: Boolean as PropType<boolean | undefined>, default: undefined },
    /** Controlled voice: a defined value cuts or restores the narration; undefined leaves it to the VO toggle. */
    voice: { type: Boolean as PropType<boolean | undefined>, default: undefined },
  },
  emits: { ready: (_show: Show) => true, 'update:sound': (_on: boolean) => true, 'update:cc': (_on: boolean) => true, 'update:voice': (_on: boolean) => true },
  setup(props, { emit, expose }) {
    const stage = ref<HTMLElement | null>(null), fit = ref<HTMLElement | null>(null);
    const size = useSize(fit);
    const { show, st, waiting, open } = useShowStarter(stage, size, props, (s) => emit('ready', s));
    // The standard chrome lives in the host div below the stage (its captions pinned over the stage). The host renders
    // once a show is there — before the first play, beside the poster's play button — so the callback ref mounts
    // the chrome exactly then, and drops it whenever the host goes: a film/locale/mode change drops it with the
    // show, as do controls off and unmount.
    const chromeHost = useShowChrome(stage, show, props, { sound: (on) => emit('update:sound', on), cc: (on) => emit('update:cc', on), voice: (on) => emit('update:voice', on) });
    const { lines, expanded } = useDescriptionLines(() => props.film, () => props.locale, () => props.description);
    watch(() => props.layout, (l) => show.value?.setLayout(l));
    watch([size, () => st.value?.layout], () => show.value?.fit(size.value.w, size.value.h));
    expose({ show });
    // Every key (←/→, Space, M, O, R, Home, F) from the core, so all players answer the same way; keys from the
    // chrome stop there (it answers Space/arrows/M/C/F itself), the rest bubble up here.
    const onKeydown = (e: KeyboardEvent) => { if (show.value && showKey(show.value, e, e.currentTarget as Element)) e.preventDefault(); };
    return () => {
      const s = show.value, x = st.value;
      return h('div', { tabindex: 0, role: 'application', 'aria-label': 'Story player', onKeydown,
        style: 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;outline:none' }, [
        h('div', { ref: fit, style: showFitStyle(props.layout) }, [
          h('div', { ref: stage, style: 'position:relative' }),
          stageChild(waiting.value, s, x?.started, { title: props.title, length: props.length, cover: props.cover }, open),
        ]),
        !waiting.value && props.controls && s && x ? h('div', { ref: chromeHost }) : null,
        props.description && lines.value ? descriptionBlock(lines.value, expanded) : null,
      ]);
    };
  },
});

/** The /show/<film> page the video pipeline drives: with `capture`, the stage at 1:1, no chrome, window.__show. */
export const ShowPage = defineComponent({
  name: 'ShowPage',
  props: {
    film: { type: String, required: true },
    layout: { type: String as PropType<Layout>, default: 'landscape' },
    locale: { type: String, default: 'en' },
    /** Capture renders light unless asked; the interactive player follows the page (auto). */
    mode: { type: String as PropType<Mode>, default: undefined },
    /** Force scenes from their JSON or their code modules (parity checks). */
    src: { type: String as PropType<'json' | 'js'>, default: undefined },
    capture: { type: Boolean, default: false },
  },
  setup(props) {
    const host = ref<HTMLElement | null>(null);
    let s: Show | null = null;
    onMounted(async () => { if (props.capture) s = await installCapture(host.value!, props.film, props.layout, props.locale, { mode: props.mode ?? 'light', src: props.src }); });
    onBeforeUnmount(() => s?.destroy());
    return () => props.capture
      ? h('div', { ref: host })
      : h('div', { style: 'position:fixed;inset:0' }, [h(MotionShow, { film: props.film, layout: props.layout, locale: props.locale, mode: props.mode ?? 'auto' })]);
  },
});
