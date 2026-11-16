// Who is calling the admin paths. Cloudflare Access sits in front of them (the Access application's policies decide
// who reaches the site at all); this checks again on the server, and fails closed:
//   - a person: a valid Access token (Cf-Access-Jwt-Assertion) signed by the team's keys, for this app's audience,
//     unexpired, naming an email in ADMIN_EMAILS;
//   - a machine: the same token issued to an Access service token, whose client id is in STAGER_CLIENT_IDS (the Mac
//     that uploads finished media and post text) or POSTER_CLIENT_IDS (the GitHub job that posts approved pieces).
// Without a team domain + audience the deployed site refuses everything here; only a dev server lets a local admin in.
// Any host whose identity proxy issues RS256 JWTs with a JWKS can reuse verifyCaller with its own certs URL.

export type Role = 'admin' | 'stager' | 'poster';
export interface Caller { role: Role; id: string }
export interface AccessConfig { teamDomain?: string; aud?: string; emails?: string; stagers?: string; posters?: string }

type Jwk = JsonWebKey & { kid?: string };
let certs: { url: string; keys: Jwk[]; at: number } | null = null;

const b64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const part = (s: string) => JSON.parse(new TextDecoder().decode(b64(s)));
const list = (raw?: string) => (raw ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

/** Where the desk lives: the admin pages and the admin API. Change them with configurePaths() before handling requests. */
export const paths = { admin: '/admin', api: '/api/admin' };
export function configurePaths(p: Partial<typeof paths>) { Object.assign(paths, p); }
export const isAdminPath = (path: string) => path === paths.admin || path.startsWith(paths.admin + '/') || path.startsWith(paths.api + '/');
export const accessConfigured = (c: AccessConfig) => Boolean(c.teamDomain && c.aud);

async function keys(teamDomain: string, fetchFn: typeof fetch, now: number): Promise<Jwk[]> {
  const url = `https://${teamDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}/cdn-cgi/access/certs`;
  if (certs && certs.url === url && now - certs.at < 3_600_000) return certs.keys;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`Access certs ${r.status}`);
  certs = { url, keys: ((await r.json()) as { keys: Jwk[] }).keys, at: now };
  return certs.keys;
}

/** The caller behind a valid Access token for this app, or null. */
export async function verifyCaller(token: string | null, c: AccessConfig, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Caller | null> {
  if (!token || !accessConfigured(c)) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  try {
    const head = part(h), claims = part(p);
    if (head.alg !== 'RS256') return null;
    const aud: string[] = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
    if (!aud.some((a) => list(c.aud).includes(String(a).toLowerCase()))) return null;
    if (typeof claims.exp !== 'number' || claims.exp * 1000 < now) return null;
    const team = c.teamDomain!.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (claims.iss && String(claims.iss).replace(/^https?:\/\//, '').replace(/\/$/, '') !== team) return null;
    let caller: Caller | null = null;
    const email = String(claims.email ?? '').toLowerCase();
    const cn = String(claims.common_name ?? '').toLowerCase();
    if (email && list(c.emails).includes(email)) caller = { role: 'admin', id: email };
    else if (!email && cn && list(c.stagers).includes(cn)) caller = { role: 'stager', id: cn };
    else if (!email && cn && list(c.posters).includes(cn)) caller = { role: 'poster', id: cn };
    if (!caller) return null;
    const jwk = (await keys(c.teamDomain!, fetchFn, now)).find((k) => k.kid === head.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(s), new TextEncoder().encode(`${h}.${p}`));
    return ok ? caller : null;
  } catch {
    return null;
  }
}

/** Which roles may use a path (and method). People: everything. Machines: only their own endpoints. */
export function allowed(role: Role, path: string, method: string): boolean {
  if (role === 'admin') return true;
  const a = paths.api;
  // The producing machine: upload media, stage posts, report what is produced, read and answer motion requests.
  if (role === 'stager') return (path.startsWith(`${a}/media/`) && method === 'PUT') || (path === `${a}/stage` && method === 'POST') ||
    (path === `${a}/production` && method === 'POST') || (path === `${a}/requests` && (method === 'GET' || method === 'POST'));
  // The CI poster: read the approved queue and the posting order, download media, report outcomes.
  if (role === 'poster') return (path === `${a}/queue` && method === 'GET') || (path === `${a}/posted` && method === 'POST') ||
    (path.startsWith(`${a}/media/`) && method === 'GET') || (path === `${a}/schedule` && method === 'GET');
  return false;
}

/** for tests: forget the cached keys */
export function resetAccessCache() { certs = null; }

/** Access settings from environment variables (CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, ADMIN_EMAILS, STAGER_CLIENT_IDS,
 *  POSTER_CLIENT_IDS). */
export const accessFromEnv = (env: Record<string, string | undefined>): AccessConfig => ({
  teamDomain: env.CF_ACCESS_TEAM_DOMAIN, aud: env.CF_ACCESS_AUD, emails: env.ADMIN_EMAILS,
  stagers: env.STAGER_CLIENT_IDS, posters: env.POSTER_CLIENT_IDS,
});

/**
 * The caller of an admin request, or null to refuse it. `dev` lets a local admin in only when Access is not set up
 * (never pass true in production). Does not check the role against the path; use allowed() for that.
 */
export async function callerOf(request: Request, config: AccessConfig, o: { dev?: boolean; fetch?: typeof fetch } = {}): Promise<Caller | null> {
  if (!accessConfigured(config)) return o.dev ? { role: 'admin', id: 'dev@localhost' } : null;
  return verifyCaller(request.headers.get('cf-access-jwt-assertion'), config, o.fetch ?? fetch);
}

