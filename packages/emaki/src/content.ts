// Stories as articles: a locale-neutral index (content/stories/index.json) plus one body per story per locale
// (content/stories/<locale>/<slug>.json). A section whose id is a scene of the story's film shows that scene as its
// figure; the film itself plays at the top; the closing card's line is the takeaway band.
import { defaultLocale, fallbackChain } from './i18n.js';

export interface StoryEntry {
  slug: string;
  publish_date: string;            // YYYY-MM-DD, in the site's time zone
  kind?: 'film' | 'short' | 'article';
  topic?: string;
  tags?: string[];
  film?: string;                   // defaults to the slug when a film of that name exists
  cover?: string;
  minutes?: number;
  social?: Record<string, string>;
  related?: { label: string; href: string };
}
export interface Section {
  id: string; eyebrow?: string; title: string; body: string[]; points?: string[]; caption?: string;
  code?: { lang: string; text: string };
  /** An app-drawn (HTML) figure, by name. Wins over the same-id scene: the section then gets no motion. */
  figure?: string;
  motion?: { film: string; scene: string };
}
export interface StoryBody {
  title: string; dek: string; kicker?: string;
  sections: Section[]; takeaway?: string; takeawaySub?: string;
  sources?: { label: string; href: string }[];
  /** Set by the loader: the body came from a fallback locale (not yet translated). */
  fallbackFrom?: string;
}
export interface Story extends StoryEntry, StoryBody { locale: string }

export interface ContentSource {
  index(): Promise<StoryEntry[]>;
  body(locale: string, slug: string): Promise<StoryBody | null>;
  /** Scene ids of a film, to map sections to figures. */
  sceneIds?(film: string): Promise<string[] | null>;
}

/** Today's date in the site's time zone, as YYYY-MM-DD (publishing is by date there, not UTC). */
export function today(timeZone = 'UTC', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/** One story in one locale, falling back along the locale chain; null when it doesn't exist. */
export async function loadStory(src: ContentSource, slug: string, locale: string): Promise<Story | null> {
  const entry = (await src.index()).find((e) => e.slug === slug);
  if (!entry) return null;
  for (const l of fallbackChain(locale)) {
    const body = await src.body(l, slug);
    if (!body) continue;
    const film = entry.film ?? slug, ids = new Set((await src.sceneIds?.(film)) ?? []);
    const sections = body.sections.map((s) => (s.motion || !ids.has(s.id) ? s : { ...s, motion: { film, scene: s.id } }));
    return { ...entry, ...body, sections, film: ids.size ? film : entry.film, locale: l, fallbackFrom: l === locale ? undefined : l };
  }
  return null;
}

/** Every published story for a locale, newest first. `drafts` includes future-dated ones (previews, admin). */
export async function listStories(src: ContentSource, locale = defaultLocale(), o: { timeZone?: string; drafts?: boolean } = {}) {
  const t = today(o.timeZone);
  const entries = (await src.index()).filter((e) => o.drafts || e.publish_date <= t);
  const out = await Promise.all(entries.map((e) => loadStory(src, e.slug, locale)));
  return (out.filter(Boolean) as Story[]).sort((a, b) => b.publish_date.localeCompare(a.publish_date));
}
