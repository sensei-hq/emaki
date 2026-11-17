// Vue 3 components over @senseihq/emaki, written as render functions so they need no SFC compiler.
// Client-only (they need the DOM): in Nuxt wrap them in <ClientOnly>. Call setupMotion(...) once on the client first.
import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, toRaw, watch, type PropType } from 'vue';
import { attachScene, createShow, figurePlayer, installCapture, showKey, type AttachedScene, type Layout, type Mode, type ScenePlayerState } from '@senseihq/emaki';
import { useScenePlayer, useShowState, useSize, type Show } from './composables.js';

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

/** The story player: a film's scenes as slides, fitted to its box. Keys: ←/→, Space, M (sound), O (orientation). */
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
  },
  emits: { ready: (_show: Show) => true },
  setup(props, { emit, expose }) {
    const stage = ref<HTMLElement | null>(null), fit = ref<HTMLElement | null>(null);
    const show = shallowRef<Show | null>(null);
    const st = useShowState(show);
    const size = useSize(fit);
    async function start() {
      show.value?.destroy(); show.value = null;
      const s = await createShow(stage.value!, props.film, { locale: props.locale, layout: props.layout, mode: props.mode, slide: props.slide, loop: props.loop });
      show.value = s; s.fit(size.value.w, size.value.h); emit('ready', s);
    }
    onMounted(start);
    onBeforeUnmount(() => show.value?.destroy());
    watch(() => [props.film, props.locale, props.mode], start);
    watch(() => props.layout, (l) => show.value?.setLayout(l));
    watch([size, () => st.value?.layout], () => show.value?.fit(size.value.w, size.value.h));
    expose({ show });
    // Every key (←/→, Space, M, O, R, Home, F) from the core, so all players answer the same way.
    const onKeydown = (e: KeyboardEvent) => { if (show.value && showKey(show.value, e, e.currentTarget as Element)) e.preventDefault(); };
    const btn = 'min-width:34px;height:34px;border-radius:17px;border:1px solid currentColor;background:none;color:inherit;cursor:pointer;padding:0 10px';
    return () => {
      const s = show.value, x = st.value;
      return h('div', { tabindex: 0, role: 'application', 'aria-label': 'Story player', onKeydown,
        style: 'position:relative;width:100%;height:100%;display:flex;flex-direction:column;outline:none' }, [
        h('div', { ref: fit, style: 'position:relative;flex:1;min-height:0;display:grid;place-items:center;overflow:hidden' }, [h('div', { ref: stage, style: 'position:relative' })]),
        props.controls && s && x
          ? h('div', { style: 'display:flex;gap:8px;align-items:center;justify-content:center;padding:8px;font:13px system-ui' }, [
              h('button', { style: btn, onClick: () => s.prev(), 'aria-label': 'Previous scene' }, '‹'),
              h('button', { style: btn, onClick: () => s.toggle(), 'aria-label': x.playing ? 'Pause' : 'Play' }, x.playing ? '❚❚' : '▶'),
              h('button', { style: btn, onClick: () => s.next(), 'aria-label': 'Next scene' }, '›'),
              h('span', { style: 'opacity:.7' }, `${x.index + 1} / ${s.timeline.scenes.length}`),
              h('button', { style: btn, onClick: () => s.setSound(!x.sound), 'aria-pressed': x.sound }, x.sound ? 'Sound on' : 'Sound off'),
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
