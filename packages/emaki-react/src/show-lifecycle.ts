// A MotionShow's controller lifecycle: created once the reader is past the cover (on mount without
// one), destroyed with the component or when the film, locale or mode change — plus the film's
// voiceover script, for the Description panel.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { createShow, voiceLines, type Layout, type Mode, type VoiceLine } from '@senseihq/emaki';
import { useShowState, type Show } from './hooks.js';

export interface ShowLifecycleOptions {
  film: string; locale: string; layout: Layout; mode: Mode; slide: number; loop: boolean; poster: boolean;
}

/** The show for the stage, with its state; `open` starts a covered show (sound on) on click. */
export function useShowInstance(stage: RefObject<HTMLDivElement | null>, opts: ShowLifecycleOptions, cover: string, onReady?: (show: Show) => void) {
  const [show, setShow] = useState<Show | null>(null);
  // With a cover nothing is created until the reader clicks; that click then starts the show (sound on). The poster
  // shows only until the reader first plays: a language or mode change after that restarts without it.
  const [waiting, setWaiting] = useState(() => !!cover);
  const autoplay = useRef(false), begun = useRef(false);
  const st = useShowState(show);
  useEffect(() => { if (st?.started && show) begun.current = true; }, [st?.started, show]);
  useEffect(() => {
    if (waiting) return;
    let alive = true, made: Show | null = null;
    const play = autoplay.current;
    autoplay.current = false;
    createShow(stage.current!, opts.film, { locale: opts.locale, layout: opts.layout, mode: opts.mode, slide: opts.slide, loop: opts.loop, poster: (opts.poster || play) && !begun.current }).then(async (s) => {
      if (!alive) return s.destroy();
      made = s; setShow(s); onReady?.(s);
      if (play) await s.start();
    });
    return () => { alive = false; made?.destroy(); setShow(null); };
  }, [opts.film, opts.locale, opts.mode, waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = () => { autoplay.current = true; setWaiting(false); };
  return { show, st, waiting, open };
}

/** The film's voice lines while descriptions are on (for the Description panel); null without them. */
export function useVoiceLines(film: string, locale: string, description: boolean): VoiceLine[] | null {
  const [lines, setLines] = useState<VoiceLine[] | null>(null);
  useEffect(() => {
    if (!description) { setLines(null); return; }
    let alive = true;
    voiceLines(film, locale).then((l) => { if (alive) setLines(l); });
    return () => { alive = false; };
  }, [film, locale, description]);
  return lines;
}
