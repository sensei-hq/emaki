import { defineConfig } from 'unocss';
import { presetRokkit } from '@rokkit/unocss';
import rokkitConfig from './rokkit.config.js';

// presetRokkit bundles presetWind3 + presetIcons + presetTypography + the Svelte extractor, emits the named tokens
// from rokkit.config.js and wires dark mode to [data-mode="dark"].
export default defineConfig({
	presets: [presetRokkit(rokkitConfig)],
	theme: {
		fontFamily: {
			display: ['Fraunces', 'Georgia', 'serif'],
			sans: ['Inter', 'system-ui', 'sans-serif'],
			mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace']
		},
		maxWidth: { content: '76rem' }
	},
	// Component tests render one component without the layout, so scan the files instead of relying on Vite's
	// transform order (otherwise the first test's CSS can miss utilities).
	content: { filesystem: ['src/**/*.svelte'] }
});
