// React components over @senseihq/emaki. All are client components (they need the DOM); in Next.js import them
// from a file marked 'use client'. Call setupMotion({ source, site, logos }) once on the client first.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { SIZES, attachScene, installCapture, sceneSound, showKey, type AttachedScene, type ChromeIconName, type ChromeTick, type Layout, type Mode, type ScenePlayerState } from '@senseihq/emaki';
import { usePlayerFor, useScenePlayer, useSize, useWidth, type Show } from './hooks.js';
import { useControlledPlayback, usePlayerChrome } from './show-chrome.js';
import { useShowInstance, useVoiceLines } from './show-lifecycle.js';

/** The default change handler: uncontrolled players without one simply toggle per instance. */
const noop = () => {};

/** Mounts a player's scene into a div and keeps it fitted (shared by MotionScene and ScenePlayer). */
function useAttached(player: ScenePlayerState, locale: string, mode: Mode, autoplay: boolean) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<AttachedScene | null>(null);
  useEffect(() => {
    view.current = attachScene(host.current!, player, { locale, mode, autoplay });
    return () => { view.current?.destroy(); view.current = null; };
  }, [player]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { view.current?.setLocale(locale); }, [locale]);
  useEffect(() => { view.current?.setMode(mode); }, [mode]);
  useEffect(() => { if (width) view.current?.fit(width); }, [width]);
  return { ref, host };
}

export interface MotionSceneProps {
  film: string; scene: string; layout?: Layout; locale?: string; mode?: Mode; autoplay?: boolean;
  className?: string; style?: CSSProperties;
  /** Controlled sound: the figure sounds only while this is true (silent when undefined). */
  sound?: boolean;
  /** Controlled captions: a defined value shows or hides the caption overlay (per-instance toggle when undefined). */
  cc?: boolean;
  /** Controlled voice cut: the figure's narration follows it (on when undefined). */
  voice?: boolean;
  /** Fires with the requested captions state whenever the reader presses the figure's CC toggle. */
  onCcChange?: (on: boolean) => void;
}

/** An article figure: one scene, looping while it is on screen. Figures sound only when the app drives them
 *  (`sound`), caption their voice line behind a CC toggle, and cut their narration with `voice`. */
export function MotionScene({ film, scene, layout = 'figure', locale = 'en', mode = 'auto', autoplay = true, className, style, sound, cc, voice, onCcChange = noop }: MotionSceneProps) {
  const player = usePlayerFor({ film, scene, layout });
  const { ref, host } = useAttached(player, locale, mode, autoplay);
  const [line, setLine] = useState<string | null | undefined>(undefined);
  const [ccOn, setCcOn] = useState(false);
  const snd = useRef<ReturnType<typeof sceneSound> | null>(null);
  useEffect(() => {
    const s = sceneSound(film, scene, locale);
    snd.current = s;
    let alive = true;
    s.caption.then((l) => { if (alive) setLine(l); });
    return () => { alive = false; snd.current = null; s.destroy(); };
  }, [film, scene, locale]);
  // Controlled inputs drive the figure sound; undefined leaves it silent with the voice on.
  useEffect(() => { if (sound !== undefined && snd.current!.on !== sound) void snd.current!.toggle(); }, [sound]);
  useEffect(() => { if (voice !== undefined) snd.current!.setVoice(voice); }, [voice]);
  const shown = cc ?? ccOn;
  const flip = () => { const next = !shown; onCcChange(next); if (cc === undefined) setCcOn(next); };
  return (
    <div ref={ref} className={className} style={{ position: 'relative', width: '100%', ...style }}>
      <div ref={host} />
      {line ? (<>
        <button type="button" className="emk-scene-cc" aria-label="Captions" title="Captions" aria-pressed={shown} onClick={flip}
          style={{ position: 'absolute', right: 10, bottom: 10, minWidth: 34, height: 34, padding: '0 8px', borderRadius: 8, border: '1px solid rgb(255 255 255 / 0.3)', background: 'rgb(20 18 15 / 0.7)', color: '#fff', font: '12px system-ui', cursor: 'pointer', opacity: shown ? 1 : 0.8 }}>
          CC
        </button>
        <p className="emk-scene-cap" aria-live="polite" hidden={!shown}
          style={{ position: 'absolute', left: '50%', bottom: '4%', transform: 'translateX(-50%)', maxWidth: '82%', margin: 0, padding: '.45em .9em', borderRadius: '.4rem', background: 'rgb(17 27 42/.82)', color: '#fff', font: 'clamp(.85rem,1.6vw,1.25rem)/1.4 system-ui', textAlign: 'center' }}>
          {line}
        </p>
      </>) : null}
    </div>
  );
}

export interface ScenePlayerProps { player: ScenePlayerState; locale?: string; mode?: Mode; controls?: boolean; className?: string }

/** A scene driven by a ScenePlayerState you own (editors, previews, step-throughs). */
export function ScenePlayer({ player, locale = 'en', mode = 'auto', controls = false, className }: ScenePlayerProps) {
  const p = useScenePlayer(player);
  const { ref, host } = useAttached(player, locale, mode, false);
  const msg: CSSProperties = { position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', margin: 0, font: '14px system-ui' };
  return (
    <div ref={ref} className={className} style={{ position: 'relative', width: '100%' }}>
      <div ref={host} />
      {p.status === 'error' && <p role="alert" style={{ ...msg, color: '#b42318' }}>{p.error}</p>}
      {p.status === 'idle' && <p style={{ ...msg, opacity: 0.7 }}>Loading the scene…</p>}
      {controls && p.status === 'ready' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, font: '12px ui-monospace, monospace' }}>
          <button onClick={() => p.toggle()} aria-label={p.playing ? 'Pause' : 'Play'}>{p.playing ? '❚❚' : '▶'}</button>
          <input type="range" aria-label="Seek" min={0} max={p.dur} step={0.05} value={p.t} onChange={(e) => p.seek(Number(e.target.value))} style={{ flex: 1 }} />
          <span>{p.t.toFixed(1)} / {p.dur.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

export interface MotionShowProps {
  film: string; locale?: string; layout?: Layout; mode?: Mode; controls?: boolean; slide?: number; loop?: boolean;
  /** Open on the film's cover frame with a play button; the first click plays it from the top with sound on. */
  poster?: boolean;
  /** An image (URL) to show with the play button; the show is created on the first click (then plays, sound on). */
  cover?: string;
  /** The film's name and running time, for the play button's label and chip. */
  title?: string; length?: string;
  /** Alias for `playerHref`: where the chrome's pop-out link goes (e.g. /show/<film>); no link when both are empty. */
  fullscreenHref?: string;
  /** Where the chrome's pop-out link goes; `fullscreenHref` is used when this is absent. */
  playerHref?: string;
  /** Glyph overrides for the chrome, merged over the core's defaults (complete <svg> strings). */
  icons?: Partial<Record<ChromeIconName, string>>;
  /** Custom tick HTML per scene (void keeps the default progress tick). */
  renderTick?: (tick: ChromeTick, index: number) => string | void;
  /** A Description button under the player that opens the film's voiceover script; hidden without one. */
  description?: boolean;
  /** Show the VO toggle (default true); false leaves mute as the single master control. */
  voiceToggle?: boolean;
  /** Controlled sound: a defined value drives mute (per-instance toggle when undefined). */
  sound?: boolean;
  /** Controlled captions: a defined value shows or hides them (per-instance toggle when undefined). */
  cc?: boolean;
  /** Controlled voice cut: a defined value drives the VO toggle (on when undefined). */
  voice?: boolean;
  /** Fires with the requested sound state whenever the viewer toggles mute. */
  onSoundChange?: (on: boolean) => void;
  /** Fires with the requested captions state whenever the viewer toggles CC. */
  onCcChange?: (on: boolean) => void;
  /** Fires with the requested voice state whenever the viewer toggles VO. */
  onVoiceChange?: (on: boolean) => void;
  /** The controller once ready (next/prev/play/pause/setSound/setLayout/seek/on), for custom chrome. */
  onReady?: (show: Show) => void;
  className?: string; style?: CSSProperties;
}

/** The play button over a poster or a cover image: the label and the chip name the film and its length. */
function PlayButton({ title, length, cover, onClick }: { title: string; length: string; cover?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={`Play the film${title ? `: ${title}` : ''}`}
      style={{ position: 'absolute', inset: 0, border: 0, padding: 0, background: 'none', cursor: 'pointer', color: 'inherit' }}>
      {cover && <img src={cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
      <span aria-hidden="true" style={{ position: 'absolute', right: 18, bottom: 14, width: 64, height: 64, borderRadius: '50%', background: 'color-mix(in srgb, currentColor 85%, transparent)', display: 'grid', placeItems: 'center' }}>
        <svg viewBox="0 0 24 24" style={{ width: 28, height: 28, fill: 'Canvas', marginLeft: 3 }}><path d="M8 5.5v13l11-6.5z" /></svg>
      </span>
      <span style={{ position: 'absolute', left: 16, bottom: 14, padding: '6px 12px', borderRadius: 999, font: '11px/1 system-ui', letterSpacing: '.1em', textTransform: 'uppercase', background: 'color-mix(in srgb, Canvas 88%, transparent)', border: '1px solid color-mix(in srgb, currentColor 20%, transparent)' }}>
        Play the film{length ? ` · ${length}` : ''}
      </span>
    </button>
  );
}

/** The story player: a film's scenes as slides, fitted to its box. Keys: ←/→ scene, Space play/pause, M sound,
 *  O orientation, R replay, Home from the top, F fullscreen. `poster` opens on the cover frame; `cover` paints an
 *  image and creates nothing until the first click. */
export function MotionShow({ film, locale = 'en', layout = 'landscape', mode = 'auto', controls = true, slide = 1, loop = false, poster = false, cover = '', title = '', length = '', fullscreenHref = '', playerHref = '', icons, renderTick, description = false, voiceToggle = true, sound, cc, voice, onSoundChange = noop, onCcChange = noop, onVoiceChange = noop, onReady, className, style }: MotionShowProps) {
  const stage = useRef<HTMLDivElement>(null);
  const chromeHost = useRef<HTMLDivElement>(null);
  const [fitRef, size] = useSize<HTMLDivElement>();
  const { show, st, waiting, open } = useShowInstance(stage, { film, locale, layout, mode, slide, loop, poster }, cover, onReady);
  // The chrome's listeners outlive each render, so they read the controlled inputs through this mirror.
  const ctl = useRef({ sound, cc, voice, onSoundChange, onCcChange, onVoiceChange });
  ctl.current = { sound, cc, voice, onSoundChange, onCcChange, onVoiceChange };
  const [expanded, setExpanded] = useState(false);
  // The standard chrome lives with the show: mounted when it is created, destroyed with it (and when controls
  // flip off). The chrome stops the keys it handles (Space, arrows, M, C, F), so they never reach showKey below.
  const syncing = usePlayerChrome(chromeHost, stage, show, { controls, film, locale, playerHref, fullscreenHref, icons, renderTick, voiceToggle }, ctl);
  // Controlled inputs drive the player: sound and voice through the controller, captions by pressing the
  // chrome's own CC toggle while it disagrees with the prop. Runs after the mount above in the same commit.
  useControlledPlayback(show, controls, chromeHost, { sound, voice, cc }, syncing);
  const lines = useVoiceLines(film, locale, description);
  // The fit box keeps the content aspect ratio for the current layout (the show's own once it reports one, so
  // the O key re-aspects too): width-driven, except portrait, which is height-driven. No flex growth — it would
  // stretch the box off-ratio; the max cap degrades to contain in a capped shell.
  const current = st?.layout ?? layout;
  const [W, H] = SIZES[current];
  const fitStyle: CSSProperties = current === 'portrait'
    ? { position: 'relative', aspectRatio: `${W} / ${H}`, height: '100%', maxWidth: '100%', margin: 'auto', display: 'grid', placeItems: 'center', overflow: 'hidden' }
    : { position: 'relative', aspectRatio: `${W} / ${H}`, width: '100%', maxHeight: '100%', margin: 'auto', display: 'grid', placeItems: 'center', overflow: 'hidden' };
  useEffect(() => { if (show && show.state.layout !== layout) show.setLayout(layout); }, [show, layout]);
  useEffect(() => { show?.fit(size.w, size.h); }, [show, size, st?.layout]);
  // Every key (←/→, Space, M, O, R, Home, F) from the core, so all players answer the same way.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => { if (show && showKey(show, e.nativeEvent, e.currentTarget)) e.preventDefault(); };
  return (
    <div tabIndex={0} role="application" aria-label="Story player" onKeyDown={onKeyDown} className={className}
      style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', outline: 'none', ...style }}>
      <div ref={fitRef} style={fitStyle}>
        <div ref={stage} style={{ position: 'relative' }} />
      </div>
      {waiting ? <PlayButton title={title} length={length} cover={cover} onClick={open} />
        : (<>
          {show && st && !st.started ? <PlayButton title={title} length={length} onClick={() => show.start()} /> : null}
          {controls && <div ref={chromeHost} />}
        </>)}
      {description && lines && (
        <div style={{ padding: '6px 12px 12px', font: '14px/1.55 system-ui' }}>
          <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}
            style={{ background: 'none', border: 0, padding: '6px 0', cursor: 'pointer', font: 'inherit', color: 'inherit', opacity: 0.75, textDecoration: 'underline' }}>
            Description {expanded ? '▾' : '▸'}
          </button>
          {expanded && <div>{lines.map((l) => <p key={l.scene} style={{ margin: '0 0 .7em' }}>{l.text}</p>)}</div>}
        </div>
      )}
    </div>
  );
}

/** mode: capture renders light unless asked; the interactive player follows the page (auto). */
export interface ShowPageProps { film: string; layout?: Layout; locale?: string; mode?: Mode; src?: 'json' | 'js'; capture?: boolean }

/** The /show/<film> page the video pipeline drives: with `capture`, the stage at 1:1, no chrome, window.__show. */
export function ShowPage({ film, layout = 'landscape', locale = 'en', mode, src, capture = false }: ShowPageProps) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!capture) return;
    let s: Show | null = null;
    installCapture(host.current!, film, layout, locale, { mode: mode ?? 'light', src }).then((x) => { s = x; });
    return () => s?.destroy();
  }, [capture, film, layout, locale, mode, src]);
  if (capture) return <div ref={host} />;
  return <div style={{ position: 'fixed', inset: 0 }}><MotionShow film={film} layout={layout} locale={locale} mode={mode ?? 'auto'} /></div>;
}
