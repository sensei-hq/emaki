import { themeHook } from '@rokkit/unocss/hooks';

// Applies the persisted theme (data-mode / data-style) before first paint, so neither the page nor the films flash.
// Shares the 'emaki-theme' storage key with the vibe store (+layout.svelte).
export const handle = themeHook({
	storageKey: 'emaki-theme',
	defaultMode: 'system',
	defaultStyle: 'zen-sumi',
	defaultDensity: 'comfortable'
});
