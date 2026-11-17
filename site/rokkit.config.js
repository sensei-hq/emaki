/**
 * Rokkit tokens for emaki.sensei-hq.com, in the films' own look: washi paper, sumi ink, rationed vermilion, jade.
 *
 * presetRokkit (uno.config.ts) turns this into the named-token utilities the components use (bg-paper,
 * text-ink, text-ink-mute, border-paper-edge, bg-primary, text-on-primary, bg-accent-soft, …), all flipping under
 * [data-mode="dark"]: the same attribute the emaki scenes follow, so the hero film turns with the page.
 *
 *   surface/ink → kami (warm paper) ↔ sumi (warm night, authored inverted: 50 is the darkest)
 *   primary/accent → shu (vermilion) · success → hisui (jade)
 */
export default {
	palettes: {
		kami: {
			50: '0.978 0.007 80',
			100: '0.958 0.009 80',
			200: '0.93 0.011 80',
			300: '0.895 0.012 78',
			400: '0.78 0.012 75',
			500: '0.62 0.012 70',
			600: '0.5 0.012 65',
			700: '0.41 0.012 60',
			800: '0.33 0.011 55',
			900: '0.25 0.01 50',
			950: '0.19 0.008 50'
		},
		sumi: {
			50: '0.2 0.008 55',
			100: '0.235 0.009 55',
			200: '0.275 0.01 55',
			300: '0.33 0.011 58',
			400: '0.45 0.012 62',
			500: '0.58 0.012 68',
			600: '0.67 0.012 72',
			700: '0.75 0.012 75',
			800: '0.86 0.01 78',
			900: '0.93 0.008 80',
			950: '0.975 0.006 80'
		},
		shu: {
			50: '0.97 0.02 40',
			100: '0.93 0.045 40',
			200: '0.87 0.075 40',
			300: '0.79 0.11 38',
			400: '0.68 0.14 37',
			500: '0.56 0.15 35',
			600: '0.5 0.145 34',
			700: '0.43 0.125 33',
			800: '0.36 0.1 33',
			900: '0.29 0.075 33',
			950: '0.21 0.05 33'
		},
		hisui: {
			50: '0.96 0.025 160',
			100: '0.92 0.045 160',
			200: '0.86 0.065 160',
			300: '0.78 0.08 160',
			400: '0.7 0.085 160',
			500: '0.61 0.08 160',
			600: '0.53 0.075 160',
			700: '0.45 0.065 160',
			800: '0.37 0.055 160',
			900: '0.3 0.045 160',
			950: '0.22 0.035 160'
		}
	},
	colorSpace: 'oklch',
	tokens: 'core',
	skin: {
		surface: { light: 'kami', dark: 'sumi' },
		ink: { light: 'kami', dark: 'sumi' },
		primary: 'shu',
		accent: 'shu',
		success: 'hisui',
		warning: 'shu',
		danger: 'shu',
		error: 'shu',
		info: 'hisui'
	},
	shape: { radius: 'soft' },
	overrides: {
		// Vermilion lifts in the dark (the films do the same), and the text on it flips to stay readable.
		primary: { light: 'shu.500', dark: 'shu.400' },
		'on-primary': { light: 'kami.50', dark: 'sumi.50' },
		'accent-soft': { light: 'shu.50', dark: 'oklch(0.3 0.05 35)' },
		'accent-line': { light: 'shu.200', dark: 'oklch(0.42 0.08 36)' },
		line: { light: 'kami.300', dark: 'sumi.300' }
	}
};
