// `emaki init`: sets a project up for motion stories. Adds the sample content (one film in en + es), a
// emaki.config.json, and the framework glue: a film source (Vite globs, or the fetch loader) and the /show capture
// route where the framework allows writing one. Never overwrites a file that exists.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { TEMPLATES } from './films.js'
import { load, save } from './util.js'

/** Which framework a project uses, from its package.json. */
export function detectFramework(cwd) {
	const pj = join(cwd, 'package.json')
	if (!existsSync(pj)) return 'vanilla'
	const p = load(pj), deps = { ...p.dependencies, ...p.devDependencies }
	if (deps['@sveltejs/kit']) return 'sveltekit'
	if (deps.svelte) return 'svelte'
	if (deps.next) return 'next'
	if (deps.nuxt) return 'nuxt'
	if (deps.react) return 'react'
	if (deps.vue) return 'vue'
	return 'vanilla'
}

export const PACKAGES = {
	sveltekit: ['@senseihq/emaki', '@senseihq/emaki-svelte'],
	svelte: ['@senseihq/emaki', '@senseihq/emaki-svelte'],
	react: ['@senseihq/emaki', '@senseihq/emaki-react'],
	next: ['@senseihq/emaki', '@senseihq/emaki-react'],
	vue: ['@senseihq/emaki', '@senseihq/emaki-vue'],
	nuxt: ['@senseihq/emaki', '@senseihq/emaki-vue'],
	vanilla: ['@senseihq/emaki']
}

const GLOBS = (content) => `const g = {
  films: import.meta.glob('/${content}/films/*/film.json', { eager: true, import: 'default' }),
  scenes: import.meta.glob('/${content}/films/*/scene-*.json', { import: 'default' }),
  strings: import.meta.glob('/${content}/films/*/strings/*.json', { import: 'default' }),
  timings: import.meta.glob('/${content}/films/*/timing*.json', { eager: true, import: 'default' }),
  raw: import.meta.glob(['/${content}/films/*/*.js', '/${content}/films/*/look.css'], { query: '?raw', import: 'default' }),
  index: import.meta.glob('/${content}/stories/index.json', { eager: true, import: 'default' }),
  bodies: import.meta.glob('/${content}/stories/*/*.json', { import: 'default' }),
  logos: import.meta.glob('/${content}/logos/*.svg', { eager: true, query: '?raw', import: 'default' }),
  site: import.meta.glob('/${content}/site.json', { eager: true, import: 'default' }),
  voice: import.meta.glob('/${content}/films/*/voice/*/*.m4a', { eager: true, query: '?url', import: 'default' }),
};`

const viteSourceFile = (content) => `// Where films and stories come from (written by \`emaki init\`). Vite expands these globs at build time, so every
// film under /${content} is bundled; scene files and sounds load on demand. Call startMotion() once on the client.
import { setupMotion } from '@senseihq/emaki';
import { viteSource } from '@senseihq/emaki/loaders/vite';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
${GLOBS(content)}

export const { filmSource, contentSource, logos, site } = viteSource(g as any);

let started = false;
export function startMotion() {
  if (started) return;
  started = true;
  setupMotion({ source: filmSource, site, logos });
}
`

const FILES = {
	sveltekit: (c) => ({
		'src/lib/emaki-source.ts': viteSourceFile(c),
		'src/routes/show/[film]/+page.ts': `// The capture page the video pipeline drives; client-only.\nexport const ssr = false;\nexport const prerender = false;\nexport const load = ({ params, url }) => ({\n  film: params.film,\n  capture: url.searchParams.get('capture') === '1',\n  layout: url.searchParams.get('o') === 'portrait' ? 'portrait' : 'landscape',\n  locale: url.searchParams.get('locale') ?? 'en',\n  src: url.searchParams.get('src') === 'json' || url.searchParams.get('src') === 'js' ? url.searchParams.get('src') : undefined,\n  mode: url.searchParams.get('mode') === 'dark' ? 'dark' : 'light',\n});\n`,
		'src/routes/show/[film]/+page.svelte': `<script lang="ts">\n  import { ShowPage } from '@senseihq/emaki-svelte';\n  import { startMotion } from '$lib/emaki-source';\n  let { data } = $props();\n  startMotion();\n</script>\n\n<ShowPage film={data.film} layout={data.layout} locale={data.locale} capture={data.capture} src={data.src} mode={data.mode} />\n`
	}),
	svelte: (c) => ({ 'src/emaki-source.ts': viteSourceFile(c) }),
	react: (c) => ({ 'src/emaki-source.ts': viteSourceFile(c) }),
	vue: (c) => ({ 'src/emaki-source.ts': viteSourceFile(c) }),
	next: () => ({
		'app/show/[film]/page.tsx': `'use client';\n// The capture page the video pipeline drives. Films are read at runtime from /public/content (emaki manifest\n// writes content/films/index.json; copy or symlink content/ into public/).\nimport { useEffect, useState } from 'react';\nimport { useSearchParams, useParams } from 'next/navigation';\nimport { setupMotion } from '@senseihq/emaki';\nimport { fetchFilmSource } from '@senseihq/emaki/loaders/fetch';\nimport { ShowPage } from '@senseihq/emaki-react';\n\nexport default function Page() {\n  const { film } = useParams<{ film: string }>();\n  const q = useSearchParams();\n  const [ready, setReady] = useState(false);\n  useEffect(() => { setupMotion({ source: fetchFilmSource('/content') }); setReady(true); }, []);\n  if (!ready) return null;\n  return <ShowPage film={film} capture={q.get('capture') === '1'} layout={q.get('o') === 'portrait' ? 'portrait' : 'landscape'} locale={q.get('locale') ?? 'en'} src={(q.get('src') as 'json' | 'js' | null) ?? undefined} mode={q.get('mode') === 'dark' ? 'dark' : 'light'} />;\n}\n`
	}),
	nuxt: () => ({}),
	vanilla: () => ({
		'motion.ts': `// Plain pages: films are read at runtime from /content (run \`emaki manifest\` after adding films).\nimport { setupMotion, installCapture } from '@senseihq/emaki';\nimport { fetchFilmSource } from '@senseihq/emaki/loaders/fetch';\nimport { defineMotionElements } from '@senseihq/emaki/elements';\n\nsetupMotion({ source: fetchFilmSource('/content') });\ndefineMotionElements();   // <motion-scene film=… scene=…> and <motion-show film=…>\n\n// The capture page: /show.html?film=<slug>&capture=1&o=landscape&locale=en\nconst q = new URLSearchParams(location.search);\nif (q.get('capture') === '1') installCapture(document.getElementById('stage')!, q.get('film')!, q.get('o') === 'portrait' ? 'portrait' : 'landscape', q.get('locale') ?? 'en', { src: (q.get('src') as 'json' | 'js' | null) ?? undefined, mode: q.get('mode') === 'dark' ? 'dark' : 'light' });\n`
	})
}

export function init({ cwd = process.cwd(), framework, content = 'content', sample = true } = {}) {
	const fw = framework ?? detectFramework(cwd)
	const wrote = [], kept = []
	const write = (rel, text) => {
		const f = join(cwd, rel)
		if (existsSync(f)) return kept.push(rel)
		mkdirSync(dirname(f), { recursive: true })
		writeFileSync(f, text)
		wrote.push(rel)
	}
	if (sample && !existsSync(join(cwd, content))) {
		cpSync(join(TEMPLATES, 'content'), join(cwd, content), { recursive: true })
		wrote.push(`${content}/ (sample film "measure-the-right-work" in en + es)`)
	} else if (existsSync(join(cwd, content))) kept.push(`${content}/`)
	const cfgPath = join(cwd, 'emaki.config.json')
	if (!existsSync(cfgPath)) {
		const cfg = JSON.parse(readFileSync(join(TEMPLATES, 'emaki.config.json'), 'utf-8'))
		cfg.content = content
		if (fw === 'sveltekit') cfg.coversDir = 'static/covers'
		cfg.showPath = fw === 'vanilla' ? '/show.html?film={slug}&capture=1&o={layout}&locale={locale}' : cfg.showPath
		save(cfgPath, cfg)
		wrote.push('emaki.config.json')
	} else kept.push('emaki.config.json')
	for (const [rel, text] of Object.entries(FILES[fw](content))) write(rel, text)
	const gi = join(cwd, '.gitignore')
	const ignore = existsSync(gi) ? readFileSync(gi, 'utf-8') : ''
	if (!/^production\/?$/m.test(ignore)) { writeFileSync(gi, ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + '# motion stories: takes, renders, sheets (never deployed)\nproduction/\n'); wrote.push('.gitignore (production/)') }
	return { framework: fw, packages: PACKAGES[fw], wrote, kept }
}
