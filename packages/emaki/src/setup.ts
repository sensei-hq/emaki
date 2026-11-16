// One call at app start-up (client side): where films come from, which languages exist, the logos scenes may draw,
// and (optionally) the <motion-scene>/<motion-show> elements. Framework wrappers call this from their own setup.
import { configureLocales, type SiteConfig } from './i18n.js';
import { registerLogo } from './renderer.js';
import { useSource, type FilmSource } from './registry.js';

export interface MotionSetup {
  source: FilmSource;
  site?: SiteConfig;
  /** name → SVG text; scenes draw them with { "type": "logo", "name": ... }. */
  logos?: Record<string, string>;
}

export function setupMotion({ source, site, logos }: MotionSetup) {
  if (site) configureLocales(site);
  useSource(source);
  for (const [name, svg] of Object.entries(logos ?? {})) registerLogo(name, svg);
}
