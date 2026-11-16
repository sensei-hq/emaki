// React components over @senseihq/emaki. All are client components (they need the DOM); in Next.js import them
// from a file marked 'use client'. Call setupMotion({ source, site, logos }) once on the client first.
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { attachScene, createShow, installCapture, type AttachedScene, type Layout, type Mode, type ScenePlayerState } from '@senseihq/emaki';
import { usePlayerFor, useScenePlayer, useShowState, useSize, useWidth, type Show } from './hooks.js';

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

export interface MotionSceneProps { film: string; scene: string; layout?: Layout; locale?: string; mode?: Mode; autoplay?: boolean; className?: string; style?: CSSProperties }

/** An article figure: one scene, looping while it is on screen. */
export function MotionScene({ film, scene, layout = 'figure', locale = 'en', mode = 'auto', autoplay = true, className, style }: MotionSceneProps) {
  const player = usePlayerFor({ film, scene, layout });
  const { ref, host } = useAttached(player, locale, mode, autoplay);
  return <div ref={ref} className={className} style={{ width: '100%', ...style }}><div ref={host} /></div>;
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
  /** The controller once ready (next/prev/play/pause/setSound/setLayout/seek/on), for custom chrome. */
  onReady?: (show: Show) => void;
  className?: string; style?: CSSProperties;
}

/** The story player: a film's scenes as slides, fitted to its box. Keys: ←/→, Space, M (sound), O (orientation). */
export function MotionShow({ film, locale = 'en', layout = 'landscape', mode = 'auto', controls = true, slide = 1, loop = false, onReady, className, style }: MotionShowProps) {
  const stage = useRef<HTMLDivElement>(null);
  const [fitRef, size] = useSize<HTMLDivElement>();
  const [show, setShow] = useState<Show | null>(null);
  const st = useShowState(show);
  useEffect(() => {
    let alive = true, made: Show | null = null;
    createShow(stage.current!, film, { locale, layout, mode, slide, loop }).then((s) => {
      if (!alive) return s.destroy();
      made = s; setShow(s); onReady?.(s);
    });
    return () => { alive = false; made?.destroy(); setShow(null); };
  }, [film, locale, mode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (show && show.state.layout !== layout) show.setLayout(layout); }, [show, layout]);
  useEffect(() => { show?.fit(size.w, size.h); }, [show, size, st?.layout]);
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!show) return;
    const k = e.key.toLowerCase();
    if (k === 'arrowright') show.next(); else if (k === 'arrowleft') show.prev();
    else if (k === ' ') { show.toggle(); e.preventDefault(); }
    else if (k === 'm') show.setSound(!show.state.sound);
    else if (k === 'o') show.setLayout(show.state.layout === 'landscape' ? 'portrait' : 'landscape');
  };
  const btn: CSSProperties = { minWidth: 34, height: 34, borderRadius: 17, border: '1px solid currentColor', background: 'none', color: 'inherit', cursor: 'pointer', padding: '0 10px' };
  return (
    <div tabIndex={0} role="application" aria-label="Story player" onKeyDown={onKeyDown} className={className}
      style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', outline: 'none', ...style }}>
      <div ref={fitRef} style={{ position: 'relative', flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
        <div ref={stage} style={{ position: 'relative' }} />
      </div>
      {controls && show && st && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', padding: 8, font: '13px system-ui' }}>
          <button style={btn} onClick={() => show.prev()} aria-label="Previous scene">‹</button>
          <button style={btn} onClick={() => show.toggle()} aria-label={st.playing ? 'Pause' : 'Play'}>{st.playing ? '❚❚' : '▶'}</button>
          <button style={btn} onClick={() => show.next()} aria-label="Next scene">›</button>
          <span style={{ opacity: 0.7 }}>{st.index + 1} / {show.timeline.scenes.length}</span>
          <button style={btn} onClick={() => show.setSound(!st.sound)} aria-pressed={st.sound}>{st.sound ? 'Sound on' : 'Sound off'}</button>
        </div>
      )}
    </div>
  );
}

/** mode: capture renders light unless asked; the interactive player follows the page (auto). */
export interface ShowPageProps { film: string; layout?: Layout; locale?: string; mode?: Mode; capture?: boolean }

/** The /show/<film> page the video pipeline drives: with `capture`, the stage at 1:1, no chrome, window.__show. */
export function ShowPage({ film, layout = 'landscape', locale = 'en', mode, capture = false }: ShowPageProps) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!capture) return;
    let s: Show | null = null;
    installCapture(host.current!, film, layout, locale, mode ?? 'light').then((x) => { s = x; });
    return () => s?.destroy();
  }, [capture, film, layout, locale, mode]);
  if (capture) return <div ref={host} />;
  return <div style={{ position: 'fixed', inset: 0 }}><MotionShow film={film} layout={layout} locale={locale} mode={mode ?? 'auto'} /></div>;
}
