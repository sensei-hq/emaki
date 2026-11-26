// A MotionShow's controller lifecycle: created once the reader is past the cover (on mount without
// one), dropped with the component or when the film, locale or mode change — plus the film's voiceover
// script, for the Description panel.
import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue';
import { createShow, voiceLines, type Layout, type Mode, type VoiceLine } from '@senseihq/emaki';
import { useShowState, type Show } from './composables.js';

/** The starter's props, read live (film, locale and mode restarts watch them). */
export interface ShowStarterProps {
  readonly film: string; readonly locale: string; readonly layout: Layout; readonly mode: Mode;
  readonly slide: number; readonly loop: boolean; readonly poster: boolean; readonly cover: string;
  readonly sound: boolean | undefined; readonly voice: boolean | undefined;
}

/** The show for the stage, with its state; `open` starts a covered show (sound on) on click. */
export function useShowStarter(stage: Ref<HTMLElement | null>, size: ShallowRef<{ w: number; h: number }>, props: ShowStarterProps, emitReady: (s: Show) => void) {
  const show = shallowRef<Show | null>(null);
  const st = useShowState(show);
  // With a cover nothing is created until the reader clicks; that click then starts the show (sound on). The poster
  // shows only until the reader first plays: a language or mode change after that restarts without it. Each start
  // gets a ticket, so a slow createShow that a newer one overtook is thrown away.
  const waiting = ref(!!props.cover);
  let autoplay = false, begun = false, ticket = 0;
  watch(() => st.value?.started, (on) => { if (on) begun = true; });
  // Controlled sound and voice: defined props drive the show (the app's state wins over the chrome's
  // toggles). Captions live inside the chrome: the show never hears about them.
  const driveShow = () => {
    const s = show.value;
    if (!s) return;
    if (props.sound !== undefined) s.setSound(props.sound);
    if (props.voice !== undefined) s.setVoice(props.voice);
  };
  async function start() {
    if (waiting.value) return;
    const mine = ++ticket, play = autoplay;
    autoplay = false;
    show.value?.destroy(); show.value = null;
    const s = await createShow(stage.value!, props.film, { locale: props.locale, layout: props.layout, mode: props.mode, slide: props.slide, loop: props.loop, poster: (props.poster || play) && !begun });
    if (mine !== ticket) return s.destroy();
    show.value = s; driveShow(); s.fit(size.value.w, size.value.h); emitReady(s);
    if (play) await s.start();
  }
  const open = () => { autoplay = true; waiting.value = false; start(); };
  onMounted(start);
  onBeforeUnmount(() => { ticket++; show.value?.destroy(); });
  watch(() => [props.film, props.locale, props.mode], start);
  watch(() => props.sound, driveShow, { immediate: true });
  watch(() => props.voice, driveShow, { immediate: true });
  return { show, st, waiting, open };
}

/** The film's voice lines while descriptions are on; each load gets a ticket, so an overtaken one is dropped. */
export function useDescriptionLines(film: () => string, locale: () => string, description: () => boolean) {
  const lines = shallowRef<VoiceLine[] | null>(null), expanded = ref(false);
  let dticket = 0;
  watch([film, locale, description], async () => {
    const mine = ++dticket;
    if (!description()) { lines.value = null; return; }
    const l = await voiceLines(film(), locale());
    if (mine === dticket) lines.value = l;
  }, { immediate: true });
  return { lines, expanded };
}
