// The player's description, YouTube-style: the film's voiceover script in a panel under the player, opened with
// a button. Off unless asked; nothing renders when the film has no script for the locale.
import { getSource } from './registry.js';
import type { VoiceLine } from './types.js';

/** The voiceover script for `locale`: one line per scene, in film order. Null without a script for the locale. */
export async function voiceLines(slug: string, locale: string): Promise<VoiceLine[] | null> {
  const lines = await getSource().voiceText?.(slug, locale);
  return lines?.length ? lines : null;
}

/** A description footer: a Description button that opens the voiceover script in a panel. Null without a script. */
export async function descriptionFooter(slug: string, opts: { locale?: string } = {}): Promise<{ el: HTMLElement; destroy: () => void } | null> {
  const lines = await voiceLines(slug, opts.locale ?? 'en');
  if (!lines) return null;
  const el = document.createElement('div');
  el.style.cssText = 'font:14px/1.55 system-ui;color:inherit';
  const btn = document.createElement('button');
  btn.style.cssText = 'background:none;border:0;padding:6px 0;cursor:pointer;font:inherit;color:inherit;opacity:.75;text-decoration:underline';
  btn.setAttribute('aria-expanded', 'false');
  const panel = document.createElement('div');
  panel.hidden = true;
  for (const l of lines) {
    const p = document.createElement('p');
    p.style.margin = '0 0 .7em';
    p.textContent = l.text;
    panel.append(p);
  }
  const label = () => `Description ${panel.hidden ? '▸' : '▾'}`;
  btn.textContent = label();
  btn.onclick = () => { panel.hidden = !panel.hidden; btn.setAttribute('aria-expanded', String(!panel.hidden)); btn.textContent = label(); };
  el.append(btn, panel);
  return { el, destroy: () => el.remove() };
}
