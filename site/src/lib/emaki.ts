// The films the site plays: the sample content `emaki init` writes, read straight from the CLI's templates (no copy,
// so the site always shows exactly what a new project gets). viteSource matches paths by their tail, so the folder can
// sit outside the site. Call startMotion() once on the client before a scene mounts.
import { setupMotion } from '@senseihq/emaki';
import { viteSource } from '@senseihq/emaki/loaders/vite';

const g = {
	films: import.meta.glob('../../../packages/emaki-cli/templates/content/films/*/film.json', { eager: true, import: 'default' }),
	scenes: import.meta.glob('../../../packages/emaki-cli/templates/content/films/*/scene-*.json', { import: 'default' }),
	strings: import.meta.glob('../../../packages/emaki-cli/templates/content/films/*/strings/*.json', { import: 'default' }),
	timings: import.meta.glob('../../../packages/emaki-cli/templates/content/films/*/timing*.json', { eager: true, import: 'default' }),
	raw: import.meta.glob(['../../../packages/emaki-cli/templates/content/films/*/*.js', '../../../packages/emaki-cli/templates/content/films/*/look.css'], {
		query: '?raw',
		import: 'default'
	}),
	logos: import.meta.glob('../../../packages/emaki-cli/templates/content/logos/*.svg', { eager: true, query: '?raw', import: 'default' }),
	site: import.meta.glob('../../../packages/emaki-cli/templates/content/site.json', { eager: true, import: 'default' }),
	voice: import.meta.glob('../../../packages/emaki-cli/templates/content/films/*/voice/*/*.m4a', { eager: true, query: '?url', import: 'default' }),
	voiceText: import.meta.glob('../../../packages/emaki-cli/templates/content/films/*/voice/*.json', { eager: true, import: 'default' })
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const { filmSource, logos, site } = viteSource(g as any);

let started = false;
/** Installs the film source, locales and logos. Safe to call more than once. */
export function startMotion() {
	if (started) return;
	started = true;
	setupMotion({ source: filmSource, site, logos });
}
