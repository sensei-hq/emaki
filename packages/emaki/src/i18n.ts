// Locales: which languages the site speaks, how a request falls back, which way text runs. Content, scene strings,
// voice scripts and timings are all keyed by the same locale codes (BCP 47: en, es, fr-CA, ar, ...).
export interface LocaleConfig {
  locales: string[];
  defaultLocale: string;
  /** Right-to-left languages among `locales` (default: ar, he, fa, ur). */
  rtl?: string[];
}

/** content/site.json: the site's name, address, time zone and languages. */
export interface SiteConfig extends LocaleConfig { name?: string; url?: string; timeZone?: string }

let config: LocaleConfig = { locales: ['en'], defaultLocale: 'en' };
export function configureLocales(c: LocaleConfig) { config = { ...c }; }
export const locales = () => config.locales;
export const defaultLocale = () => config.defaultLocale;

const RTL = ['ar', 'he', 'fa', 'ur'];
/** Text direction for a locale. */
export function dirOf(locale: string): 'ltr' | 'rtl' {
  const lang = locale.split('-')[0];
  return (config.rtl ?? RTL).includes(lang) ? 'rtl' : 'ltr';
}

/** The lookup order for a requested locale: fr-CA → fr → default. Only configured locales are kept. */
export function fallbackChain(locale: string): string[] {
  const chain = [locale, locale.split('-')[0], config.defaultLocale];
  return [...new Set(chain)].filter((l) => config.locales.includes(l) || l === config.defaultLocale);
}

/** Best configured locale for an Accept-Language header or navigator.languages list. */
export function negotiate(wanted: readonly string[]): string {
  for (const w of wanted) {
    const exact = config.locales.find((l) => l.toLowerCase() === w.toLowerCase());
    if (exact) return exact;
    const lang = config.locales.find((l) => l.split('-')[0] === w.split('-')[0]);
    if (lang) return lang;
  }
  return config.defaultLocale;
}

/** UI strings: t(dict, 'nav.articles', { n: 3 }) with {name} interpolation; a missing key shows as the key. */
export function t(dict: Record<string, string>, key: string, vars: Record<string, string | number> = {}) {
  const s = dict[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/** Merges string tables along the fallback chain, most specific last (so it wins). */
export function mergeChain(tables: (Record<string, string> | null | undefined)[]) {
  return Object.assign({}, ...tables.filter(Boolean).reverse()) as Record<string, string>;
}

/** Dates as the reader expects them. */
export const formatDate = (iso: string, locale: string, opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'short', day: 'numeric' }) =>
  new Date(iso + 'T12:00:00Z').toLocaleDateString(locale, opts);
