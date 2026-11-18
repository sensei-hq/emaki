// Vue 3 components over @senseihq/emaki, written as render functions so they need no SFC compiler.
// Client-only (they need the DOM): in Nuxt wrap them in <ClientOnly>. Call setupMotion(...) once on the client first.
import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch, type PropType } from 'vue';
import { attachScene, createShow, figurePlayer, installCapture, showKey, ticks, voiceLines, type AttachedScene, type Layout, type Mode, type ScenePlayerState, type VoiceLine } from '@senseihq/emaki';
import { useScenePlayer, useShowState, useSize, type Show, type ShowState } from './composables.js';

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

/** An article figure: one scene, looping while it is on screen. */
export const MotionScene = defineComponent({
  name: 'MotionScene',
  props: {
    film: { type: String, required: true },
    scene: { type: String, required: true },
    layout: { type: String as PropType<Layout>, default: 'figure' },
    locale: { type: String, default: 'en' },
    mode: { type: String as PropType<Mode>, default: 'auto' },
    autoplay: { type: Boolean, default: true },
  },
  setup(props) {
    const player = figurePlayer({ film: props.film, scene: props.scene, layout: props.layout });
    watch(() => [props.film, props.scene, props.layout] as const, ([film, scene, layout]) => player.load({ film, scene, layout }));
    const { box, host } = attach(() => player, () => props.locale, () => props.mode, props.autoplay);
    return () => h('div', { ref: box, class: 'motion-scene', style: 'width:100%' }, [h('div', { ref: host })]);
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

const btn = 'min-width:34px;height:34px;border-radius:17px;border:1px solid currentColor;background:none;color:inherit;cursor:pointer;padding:0 10px';
const tickTrack = 'linear-gradient(color-mix(in srgb, currentColor 18%, transparent), color-mix(in srgb, currentColor 18%, transparent)) center / 100% 4px no-repeat';

/** The play button over a poster or a cover image: the label and the chip name the film and its length. */
function playButton(title: string, length: string, onClick: () => void, cover?: string) {
  return h('button', { onClick, 'aria-label': `Play the film${title ? `: ${title}` : ''}`,
    style: 'position:absolute;inset:0;border:0;padding:0;background:none;cursor:pointer;color:inherit' }, [
    cover ? h('img', { src: cover, alt: '', style: 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover' }) : null,
    h('span', { 'aria-hidden': 'true', style: 'position:absolute;right:18px;bottom:14px;width:64px;height:64px;border-radius:50%;background:color-mix(in srgb, currentColor 85%, transparent);display:grid;place-items:center' },
      [h('svg', { viewBox: '0 0 24 24', style: 'width:28px;height:28px;fill:Canvas;margin-left:3px' }, [h('path', { d: 'M8 5.5v13l11-6.5z' })])]),
    h('span', { style: 'position:absolute;left:16px;bottom:14px;padding:6px 12px;border-radius:999px;font:11px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;background:color-mix(in srgb, Canvas 88%, transparent);border:1px solid color-mix(in srgb, currentColor 20%, transparent)' },
      `Play the film${length ? ` · ${length}` : ''}`),
  ]);
}

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
    /** Where the full-screen link goes (e.g. /show/<film>); no link when empty. */
    fullscreenHref: { type: String, default: '' },
    /** A Description button under the player that opens the film's voiceover script; hidden without one. */
    description: { type: Boolean, default: false },
  },
  emits: { ready: (_show: Show) => true },
  setup(props, { emit, expose }) {
    const stage = ref<HTMLElement | null>(null), fit = ref<HTMLElement | null>(null);
    const show = shallowRef<Show | null>(null);
    const st = useShowState(show);
    const size = useSize(fit);
    // With a cover nothing is created until the reader clicks; that click then starts the show (sound on). The poster
    // shows only until the reader first plays: a language or mode change after that restarts without it. Each start
    // gets a ticket, so a slow createShow that a newer one overtook is thrown away.
    const waiting = ref(!!props.cover);
    let autoplay = false, begun = false, ticket = 0;
    watch(() => st.value?.started, (on) => { if (on) begun = true; });
    async function start() {
      if (waiting.value) return;
      const mine = ++ticket, play = autoplay;
      autoplay = false;
      show.value?.destroy(); show.value = null;
      const s = await createShow(stage.value!, props.film, { locale: props.locale, layout: props.layout, mode: props.mode, slide: props.slide, loop: props.loop, poster: (props.poster || play) && !begun });
      if (mine !== ticket) return s.destroy();
      show.value = s; s.fit(size.value.w, size.value.h); emit('ready', s);
      if (play) await s.start();
    }
    const open = () => { autoplay = true; waiting.value = false; start(); };
    onMounted(start);
    onBeforeUnmount(() => { ticket++; show.value?.destroy(); });
    const lines = shallowRef<VoiceLine[] | null>(null), expanded = ref(false);
    let dticket = 0;
    watch([() => props.film, () => props.locale, () => props.description], async () => {
      const mine = ++dticket;
      if (!props.description) { lines.value = null; return; }
      const l = await voiceLines(props.film, props.locale);
      if (mine === dticket) lines.value = l;
    }, { immediate: true });
    watch(() => [props.film, props.locale, props.mode], start);
    watch(() => props.layout, (l) => show.value?.setLayout(l));
    watch([size, () => st.value?.layout], () => show.value?.fit(size.value.w, size.value.h));
    expose({ show });
    // Every key (←/→, Space, M, O, R, Home, F) from the core, so all players answer the same way.
    const onKeydown = (e: KeyboardEvent) => { if (show.value && showKey(show.value, e, e.currentTarget as Element)) e.preventDefault(); };
    const bar = (s: Show, x: ShowState) => h('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:center;padding:8px;font:13px system-ui' }, [
      h('button', { style: btn, onClick: () => s.prev(), 'aria-label': 'Previous scene' }, '‹'),
      h('button', { style: btn, onClick: () => s.toggle(), 'aria-label': x.playing ? 'Pause' : 'Play' }, x.playing ? '❚❚' : '▶'),
      h('button', { style: btn, onClick: () => s.next(), 'aria-label': 'Next scene' }, '›'),
      h('div', { style: 'flex:1;display:flex;gap:3px;max-width:360px' }, ticks(s).map((tk, i) =>
        h('button', { key: tk.id, onClick: () => s.go(i), 'aria-label': tk.name,
          style: `flex:${tk.dur};min-width:0;height:18px;padding:7px 0;border:0;border-radius:0;background:${tickTrack};cursor:pointer;color:inherit` },
          [h('span', { style: `display:block;height:4px;border-radius:2px;background:currentColor;width:${tk.fill * 100}%` })]))),
      h('span', { style: 'opacity:.7;font-variant-numeric:tabular-nums' }, `${x.index + 1} / ${s.timeline.scenes.length}`),
      h('button', { style: btn, onClick: () => s.setSound(!x.sound), 'aria-pressed': x.sound }, x.sound ? 'Sound on' : 'Sound off'),
      props.fullscreenHref
        ? h('a', { href: props.fullscreenHref, 'aria-label': 'Open full screen', title: 'Full screen', style: `${btn};display:grid;place-items:center;text-decoration:none;padding:0` }, '⤢')
        : null,
    ]);
    return () => {
      const s = show.value, x = st.value;
      return h('div', { tabindex: 0, role: 'application', 'aria-label': 'Story player', onKeydown,
        style: 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;outline:none' }, [
        h('div', { ref: fit, style: 'position:relative;flex:1;min-height:0;display:grid;place-items:center;overflow:hidden' }, [h('div', { ref: stage, style: 'position:relative' })]),
        waiting.value ? playButton(props.title, props.length, open, props.cover)
          : s && x && !x.started ? playButton(props.title, props.length, () => s.start())
          : props.controls && s && x ? bar(s, x) : null,
        props.description && lines.value
          ? h('div', { style: 'padding:6px 12px 12px;font:14px/1.55 system-ui' }, [
            h('button', { onClick: () => (expanded.value = !expanded.value), 'aria-expanded': expanded.value, style: 'background:none;border:0;padding:6px 0;cursor:pointer;font:inherit;color:inherit;opacity:.75;text-decoration:underline' }, `Description ${expanded.value ? '▾' : '▸'}`),
            expanded.value ? h('div', lines.value.map((l) => h('p', { key: l.scene, style: 'margin:0 0 .7em' }, l.text))) : null,
          ])
          : null,
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
