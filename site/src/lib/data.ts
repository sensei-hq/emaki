/* emaki.sensei-hq.com: the site's words and links in one place, so components only lay them out.
   The release comes from the root package.json (one version for everything), so the site never drifts. */
import { version } from '../../../package.json';

export const REPO = 'https://github.com/sensei-hq/emaki';
const NPM = 'https://www.npmjs.com/package';

/** Current release, e.g. "0.1.0". */
export const VERSION = version;

/** The sample film every section plays: the one `emaki init` writes into a new project. */
export const FILM = 'measure-the-right-work';

export const brand = {
	name: 'emaki',
	tagline:
		'Motion stories: article figures, a story player and narrated videos from one set of JSON scenes, in every language.'
};

export const nav = {
	links: [
		{ label: 'Features', href: '/#features' },
		{ label: 'Packages', href: '/#packages' },
		{ label: 'Usage', href: '/#usage' },
		{ label: 'Plugin', href: '/#plugin' },
		{ label: 'Docs', href: '/docs' },
		{ label: 'GitHub', href: REPO }
	],
	cta: { label: 'Get started', href: '/#start' }
};

export const INIT = 'npx @senseihq/emaki-cli init';

export const hero = {
	badge: ['npm', 'Motion stories'],
	title: 'One set of scenes. An article, a player and a video.',
	lede: 'Write a story once as JSON scenes. emaki draws it as the figures in your article, as a story player, and as narrated 16:9 and 9:16 video, in every language you publish, in light and in dark.',
	primaryCta: { label: 'Read the docs', href: '/docs' },
	secondaryCta: { label: 'View on GitHub', href: REPO },
	note: 'The sample story, playing live. Switch the theme and it follows.'
};

export const proof = {
	label: 'Renders in',
	items: ['Svelte 5', 'React', 'Vue 3', 'web components', 'Astro', 'Eleventy', 'MP4 · 16:9 + 9:16']
};

export type Feature = { tag: string; title: string; body: string };

export const features = {
	eyebrow: 'What a story becomes',
	title: 'Author the scene once. Show it everywhere it is read or watched.',
	lede: 'A scene is a pure function of time, so the same file draws the same frame in a figure, a player and a video.',
	items: [
		{
			tag: 'scenes',
			title: 'JSON scenes',
			body: 'Components and tracks on a 1920×1080 board, validated by JSON Schemas. Code scenes are the escape hatch, not the rule.'
		},
		{
			tag: 'figures',
			title: 'Article figures',
			body: 'Each section of a story gets its scene as a looping figure: the artwork only, framed at 16:10, playing while it is on screen.'
		},
		{
			tag: 'player',
			title: 'Story player',
			body: 'The whole film as slides in landscape or portrait, with keys, sound on request (the score, and the narration of the scene on screen) and a controller you can drive from your own chrome.'
		},
		{
			tag: 'video',
			title: 'Narrated video',
			body: 'emaki renders 16:9 and 9:16 video frame by frame from the same page, with voice from your TTS provider and timings fitted to it.'
		},
		{
			tag: 'i18n',
			title: 'Every language',
			body: 'Scene text lives in strings/<locale>.json and falls back fr-CA → fr → default. Right-to-left, and running times fitted per language.'
		},
		{
			tag: 'mode',
			title: 'Light and dark',
			body: 'A film can carry a dark look. Scenes follow the page’s data-mode, the attribute rokkit sets, or the OS, and switch as it changes.'
		}
	] satisfies Feature[]
};

export type Pkg = { name: string; body: string; chips: string[]; href: string };

export const packages = {
	eyebrow: 'Packages',
	title: 'A framework-free core, thin wrappers, and the tools around it.',
	items: [
		{
			name: '@senseihq/emaki',
			body: 'The core: the scene renderer, film registry, story player controller, capture contract, i18n, web components, loaders and JSON Schemas.',
			chips: ['framework-free', 'web components', 'schemas']
		},
		{
			name: '@senseihq/emaki-svelte',
			body: 'Svelte 5 components: MotionScene, MotionShow, ScenePlayer and ShowPage, bound to the core’s state with runes.',
			chips: ['Svelte 5', 'runes']
		},
		{
			name: '@senseihq/emaki-react',
			body: 'The same components for React, with hooks for a scene player you own and a story player’s state.',
			chips: ['React', 'hooks']
		},
		{
			name: '@senseihq/emaki-vue',
			body: 'The same components for Vue 3 as render functions, with composables for the player state.',
			chips: ['Vue 3', 'composables']
		},
		{
			name: '@senseihq/emaki-posting',
			body: 'The posting desk: stage, approve exactly what was staged, post on schedule. Cloudflare (D1, R2, Access) and SvelteKit adapters.',
			chips: ['Cloudflare', 'SvelteKit']
		},
		{
			name: '@senseihq/emaki-cli',
			body: 'The emaki command: init a project, install the Claude plugin, and validate, voice, fit, sheet and render every film per locale.',
			chips: ['CLI', 'TTS', 'render']
		}
	].map((p) => ({ ...p, href: `${NPM}/${p.name}` })) satisfies Pkg[]
};

export const showcase = {
	eyebrow: 'Try it',
	title: 'The same scene, in another language or another light.',
	lede: 'This figure is one scene from the sample film. Pick a language or a mode: the scene redraws, nothing is re-authored.',
	scene: 'pair',
	locales: [
		{ id: 'en', label: 'English' },
		{ id: 'es', label: 'Español' }
	],
	modes: [
		{ id: 'auto', label: 'Follow page' },
		{ id: 'light', label: 'Light' },
		{ id: 'dark', label: 'Dark' }
	]
} as const;

const SVELTE = `<script>
  import { MotionScene, MotionShow } from '@senseihq/emaki-svelte';
</script>

<!-- an article figure: loops while it is on screen -->
<MotionScene film="${FILM}" scene="pair" locale="es" />

<!-- the story player; follows the page's data-mode -->
<div style="aspect-ratio:16/10"><MotionShow film="${FILM}" /></div>`;

const REACT = `import { MotionScene, MotionShow } from '@senseihq/emaki-react';

export function Story() {
  return (
    <>
      <MotionScene film="${FILM}" scene="pair" locale="es" />
      <div style={{ aspectRatio: '16/10' }}><MotionShow film="${FILM}" mode="dark" /></div>
    </>
  );
}`;

const VUE = `<script setup>
import { MotionScene, MotionShow } from '@senseihq/emaki-vue';
</script>

<template>
  <MotionScene film="${FILM}" scene="pair" locale="es" />
  <div style="aspect-ratio:16/10"><MotionShow film="${FILM}" /></div>
</template>`;

const HTML = `<script type="module">
  import { setupMotion } from '@senseihq/emaki';
  import { fetchFilmSource } from '@senseihq/emaki/loaders/fetch';
  import { defineMotionElements } from '@senseihq/emaki/elements';
  setupMotion({ source: fetchFilmSource('/content') });
  defineMotionElements();
</script>

<motion-scene film="${FILM}" scene="pair" locale="es"></motion-scene>
<motion-show film="${FILM}" mode="auto" style="aspect-ratio:16/10"></motion-show>`;

export const usage = {
	eyebrow: 'Usage',
	title: 'Drop a scene into the page you already have.',
	lede: 'Every wrapper takes the same props: film, scene, layout, locale and mode. Plain HTML gets web components.',
	tabs: [
		{ id: 'svelte', label: 'Svelte', code: SVELTE },
		{ id: 'react', label: 'React', code: REACT },
		{ id: 'vue', label: 'Vue', code: VUE },
		{ id: 'html', label: 'HTML', code: HTML }
	],
	note: 'Call setupMotion({ source, site, logos }) once on the client; `emaki init` writes the source for your framework.'
};

export const plugin = {
	eyebrow: 'Claude plugin',
	title: 'A playbook your coding agent can run.',
	lede: '`emaki init` installs a Claude plugin: skills that run the program from interview to publishing, and agents that plan, write, build, localise and review each story.',
	skills: [
		{ name: 'emaki', body: 'Runs the whole program: interview, outline, item cards, foundation, a pilot story, then batches.' },
		{ name: 'story-build', body: 'Turns an item card into a story body, a film of JSON scenes, strings, sound and a verified contact sheet.' },
		{ name: 'story-localize', body: 'Adds a language: story bodies, scene strings, voice scripts and UI strings, every key validated.' },
		{ name: 'story-media', body: 'Runs voice, fit, voice-web, render and build per locale, and checks the delivery list.' },
		{ name: 'story-review', body: 'Checks stories against the quality gates and turns feedback into fixes, with before/after evidence.' },
		{ name: 'story-publish', body: 'Runs the release checklist, deploys, and sets up the optional posting desk and campaigns.' }
	],
	agents: ['story-planner', 'story-writer', 'scene-builder', 'localizer', 'fact-checker', 'visual-reviewer']
};

export const start = {
	title: 'Start with the sample story.',
	lede: 'One command detects your framework and writes the sample content, the film source, the capture route and the Claude plugin.',
	code: INIT,
	primaryCta: { label: 'Read the architecture', href: '/docs/architecture' },
	secondaryCta: { label: 'View on GitHub', href: REPO }
};

export const footer = {
	tagline: brand.tagline,
	columns: [
		{
			title: 'Docs',
			links: [
				{ label: 'Architecture', href: '/docs/architecture' },
				{ label: 'Content model', href: '/docs/content-model' },
				{ label: 'Scene authoring', href: '/docs/scene-authoring' },
				{ label: 'Languages', href: '/docs/i18n' },
				{ label: 'Voice and video', href: '/docs/voice-and-video' }
			]
		},
		{
			title: 'Project',
			links: [
				{ label: 'GitHub', href: REPO },
				{ label: 'npm', href: `${NPM}/@senseihq/emaki` },
				{ label: 'llms.txt', href: '/llms.txt' },
				{ label: 'llms-full.txt', href: '/llms-full.txt' }
			]
		}
	],
	legal: 'MIT © SenecaGlobal'
};
