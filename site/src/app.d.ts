// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	/** The release, from the root package.json (vite.config.ts). */
	const __APP_VERSION__: string;
	namespace App {}
}

export {};
