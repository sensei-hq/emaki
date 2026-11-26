// A MotionShow's render helpers: the aspect-ratio stage box, the play button over a poster or a
// cover image, and the Description panel. Pure render functions over the setup's refs.
import { h, type Ref, type VNode } from 'vue';
import { SIZES, type Layout, type VoiceLine } from '@senseihq/emaki';
import type { Show } from './composables.js';

/** The play button over a poster or a cover image: the label and the chip name the film and its length. */
export function playButton(title: string, length: string, onClick: () => void, cover?: string) {
  return h('button', { onClick, 'aria-label': `Play the film${title ? `: ${title}` : ''}`,
    style: 'position:absolute;inset:0;border:0;padding:0;background:none;cursor:pointer;color:inherit' }, [
    cover ? h('img', { src: cover, alt: '', style: 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover' }) : null,
    h('span', { 'aria-hidden': 'true', style: 'position:absolute;right:18px;bottom:14px;width:64px;height:64px;border-radius:50%;background:color-mix(in srgb, currentColor 85%, transparent);display:grid;place-items:center' },
      [h('svg', { viewBox: '0 0 24 24', style: 'width:28px;height:28px;fill:Canvas;margin-left:3px' }, [h('path', { d: 'M8 5.5v13l11-6.5z' })])]),
    h('span', { style: 'position:absolute;left:16px;bottom:14px;padding:6px 12px;border-radius:999px;font:11px/1 system-ui;letter-spacing:.1em;text-transform:uppercase;background:color-mix(in srgb, Canvas 88%, transparent);border:1px solid color-mix(in srgb, currentColor 20%, transparent)' },
      `Play the film${length ? ` · ${length}` : ''}`),
  ]);
}

/** The stage wrapper style: the content aspect ratio for the layout, width-driven off portrait, height-driven on it. */
export function showFitStyle(layout: Layout): string {
  const [W, H] = SIZES[layout];
  return layout === 'portrait'
    ? `position:relative;aspect-ratio:${W}/${H};height:100%;max-width:100%;margin:auto;display:grid;place-items:center;overflow:hidden`
    : `position:relative;aspect-ratio:${W}/${H};width:100%;max-height:100%;margin:auto;display:grid;place-items:center;overflow:hidden`;
}

/** The play button over a covered or unstarted show (nothing once it plays). */
export function stageChild(waiting: boolean, s: Show | null, started: boolean | undefined, meta: { title: string; length: string; cover: string }, open: () => void): VNode | null {
  if (waiting) return playButton(meta.title, meta.length, open, meta.cover);
  if (s && started === false) return playButton(meta.title, meta.length, () => s.start());
  return null;
}

/** The Description panel: a button opening the film's voiceover script. */
export function descriptionBlock(lines: VoiceLine[], expanded: Ref<boolean>): VNode {
  return h('div', { style: 'padding:6px 12px 12px;font:14px/1.55 system-ui' }, [
    h('button', { onClick: () => (expanded.value = !expanded.value), 'aria-expanded': expanded.value, style: 'background:none;border:0;padding:6px 0;cursor:pointer;font:inherit;color:inherit;opacity:.75;text-decoration:underline' }, `Description ${expanded.value ? '▾' : '▸'}`),
    expanded.value ? h('div', lines.map((l) => h('p', { key: l.scene, style: 'margin:0 0 .7em' }, l.text))) : null,
  ]);
}
