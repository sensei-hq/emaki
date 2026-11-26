// A MotionShow's standard chrome: mounted with the show (destroyed with it, and when controls flip
// off), bridging its toggles to the controlled props. A defined prop wins over the chrome's toggles:
// the press never reaches the chrome, the app hears it instead. An undefined prop leaves the toggle
// per instance; the wrapper reports what the press did.
import { useEffect, useRef, type RefObject } from 'react';
import { mountPlayerChrome, type ChromeIconName, type ChromeTick } from '@senseihq/emaki';
import type { Show } from './hooks.js';

/** The controlled inputs, mirrored every render for the chrome's long-lived listeners. */
export interface ChromeControlState {
  sound: boolean | undefined;
  cc: boolean | undefined;
  voice: boolean | undefined;
  onSoundChange: (on: boolean) => void;
  onCcChange: (on: boolean) => void;
  onVoiceChange: (on: boolean) => void;
}

export interface ChromeMountOptions {
  controls: boolean; film: string; locale: string; playerHref: string; fullscreenHref: string; voiceToggle: boolean;
  icons?: Partial<Record<ChromeIconName, string>>;
  renderTick?: (tick: ChromeTick, index: number) => string | void;
}

/** A press under a defined prop: swallowed (the app's state wins), the request emitted. */
function captureToggle(prop: boolean | undefined, emit: (on: boolean) => void, e: Event): void {
  if (prop === undefined) return;
  e.stopPropagation();
  emit(!prop);
}

function chromeCapture(ctl: { current: ChromeControlState }, syncing: { current: boolean }, e: Event): void {
  if (syncing.current) return;
  const t = (e.target as HTMLElement).closest('.emk-mute,.emk-cc,.emk-voice');
  if (!t) return;
  const c = ctl.current;
  if (t.classList.contains('emk-mute')) captureToggle(c.sound, (v) => c.onSoundChange(v), e);
  else if (t.classList.contains('emk-cc')) captureToggle(c.cc, (v) => c.onCcChange(v), e);
  else captureToggle(c.voice, (v) => c.onVoiceChange(v), e);
}

function chromeBubble(ctl: { current: ChromeControlState }, syncing: { current: boolean }, e: Event): void {
  if (syncing.current) return;
  const t = (e.target as HTMLElement).closest('.emk-mute,.emk-cc,.emk-voice');
  if (!t) return;
  const c = ctl.current;
  const pressed = (t as HTMLButtonElement).getAttribute('aria-pressed') === 'true';
  if (t.classList.contains('emk-mute')) c.onSoundChange(pressed);
  else if (t.classList.contains('emk-cc')) c.onCcChange(pressed);
  else c.onVoiceChange(pressed);
}

// M reaches straight into the show: emit the request, and under a defined sound keep it from the
// chrome. (V and C arrive as toggle clicks, which the capture above sees.)
function chromeKeyCapture(ctl: { current: ChromeControlState }, show: Show, e: Event): void {
  if ((e as KeyboardEvent).key.toLowerCase() !== 'm') return;
  const c = ctl.current;
  c.onSoundChange(!(c.sound ?? show.state.sound));
  if (c.sound === undefined) return;
  e.stopImmediatePropagation();
  e.preventDefault();
}

/** Mounts the standard chrome with the show; the chrome stops the keys it handles (Space, arrows, M, C, F).
 *  Returns the sync flag, true while the wrapper itself presses the chrome's CC toggle (not a user toggle). */
export function usePlayerChrome(chromeHost: RefObject<HTMLDivElement | null>, stage: RefObject<HTMLDivElement | null>, show: Show | null, opts: ChromeMountOptions, ctl: { current: ChromeControlState }): { current: boolean } {
  const syncing = useRef(false);
  useEffect(() => {
    if (!show || !opts.controls) return;
    const host = chromeHost.current!;
    const chrome = mountPlayerChrome(host, show, {
      film: opts.film, locale: opts.locale, stage: stage.current!, playerHref: opts.playerHref || opts.fullscreenHref || undefined, icons: opts.icons, renderTick: opts.renderTick, voiceToggle: opts.voiceToggle,
    });
    const onCapture = (e: Event) => chromeCapture(ctl, syncing, e);
    const onBubble = (e: Event) => chromeBubble(ctl, syncing, e);
    const onKeyCapture = (e: Event) => chromeKeyCapture(ctl, show, e);
    host.addEventListener('click', onCapture, true);
    host.addEventListener('click', onBubble);
    host.addEventListener('keydown', onKeyCapture, true);
    return () => {
      host.removeEventListener('click', onCapture, true);
      host.removeEventListener('click', onBubble);
      host.removeEventListener('keydown', onKeyCapture, true);
      chrome.destroy();
    };
  }, [show, opts.controls, opts.film, opts.locale, opts.playerHref, opts.fullscreenHref, opts.icons, opts.renderTick, opts.voiceToggle]); // eslint-disable-line react-hooks/exhaustive-deps
  return syncing;
}

/** Presses the chrome's own CC toggle while it disagrees with a controlled `cc`. */
function syncCcButton(chromeHost: RefObject<HTMLDivElement | null>, cc: boolean, syncing: { current: boolean }): void {
  const btn = chromeHost.current!.querySelector('.emk-cc') as HTMLButtonElement | null;
  if (!btn) return;
  if ((btn.getAttribute('aria-pressed') === 'true') === cc) return;
  syncing.current = true;
  btn.click();
  syncing.current = false;
}

/** Controlled inputs drive the player: sound and voice through the controller, captions through the chrome. */
export function useControlledPlayback(show: Show | null, controls: boolean, chromeHost: RefObject<HTMLDivElement | null>, inputs: { sound: boolean | undefined; voice: boolean | undefined; cc: boolean | undefined }, syncing: { current: boolean }): void {
  const { sound, voice, cc } = inputs;
  useEffect(() => { if (show && sound !== undefined) show.setSound(sound); }, [show, sound]);
  useEffect(() => { if (show && voice !== undefined) show.setVoice(voice); }, [show, voice]);
  useEffect(() => {
    if (!show || !controls || cc === undefined) return;
    syncCcButton(chromeHost, cc, syncing);
  }, [show, controls, cc, chromeHost, syncing]);
}
