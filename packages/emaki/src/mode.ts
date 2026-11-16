// Light and dark. The stage carries data-mode="light|dark" and the film's look.css styles #stage[data-mode="dark"].
// 'auto' reads the page the way rokkit writes it (themable sets data-mode on <html> and <body>): the nearest
// data-mode up from the host, looking out through shadow roots, else the OS preference. It keeps following both
// until the returned stop() runs. A film without a `dark` block is always drawn light.
import type { FilmMeta, Mode } from './types.js';

/** data-mode on the nearest ancestor of `node`, crossing shadow roots; null when the page sets none. */
export function pageMode(node: Node): 'light' | 'dark' | null {
  for (let n: Node | null = node; n; n = n.parentNode ?? (n instanceof ShadowRoot ? n.host : null)) {
    const m = n instanceof Element ? n.getAttribute('data-mode') : null;
    if (m === 'light' || m === 'dark') return m;
  }
  return null;
}

/** Sets the stage's data-mode for `mode` and, for 'auto', keeps it in step with the page. Returns stop(). */
export function followMode(stage: HTMLElement, host: HTMLElement, f: FilmMeta, mode: Mode = 'auto'): () => void {
  const follows = mode === 'auto' && !!f.dark;
  const os = follows && typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  const apply = () => {
    if (!f.dark) return void (stage.dataset.mode = 'light');
    stage.dataset.mode = mode !== 'auto' ? mode : pageMode(host) ?? (os?.matches ? 'dark' : 'light');
  };
  apply();
  if (!follows) return () => {};
  const watch = new MutationObserver(apply);
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'], subtree: true });
  os?.addEventListener('change', apply);
  return () => { watch.disconnect(); os?.removeEventListener('change', apply); };
}
