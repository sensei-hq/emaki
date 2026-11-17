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

/** A host without its scheme or trailing slash, so a team domain and an issuer compare however they are written. */
const bare = (host: string) => host.replace(/^https?:\/\//, '').replace(/\/$/, '');

async function keys(teamDomain: string, fetchFn: typeof fetch, now: number): Promise<Jwk[]> {
  const url = `https://${bare(teamDomain)}/cdn-cgi/access/certs`;
  if (certs && certs.url === url && now - certs.at < 3_600_000) return certs.keys;
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`Access certs ${r.status}`);
  certs = { url, keys: ((await r.json()) as { keys: Jwk[] }).keys, at: now };
  return certs.keys;
}

type Claims = Record<string, unknown>;
/** A token split into its parts, header and claims decoded. */
interface Token { h: string; p: string; s: string; head: Claims; claims: Claims }
/** What a token is checked against. */
interface Check { c: AccessConfig; fetchFn: typeof fetch; now: number }

/** Why a token is refused before anyone is looked up, in the order they are checked; the first that holds refuses. */
const REFUSALS: ((t: Token, k: Check) => boolean)[] = [
  // not RS256
  (t) => t.head.alg !== 'RS256',
  // not for this app's audience
  (t, k) => !(Array.isArray(t.claims.aud) ? t.claims.aud : [t.claims.aud]).some((a) => list(k.c.aud).includes(String(a).toLowerCase())),
  // no expiry, or expired
  (t, k) => typeof t.claims.exp !== 'number' || t.claims.exp * 1000 < k.now,
  // issued by another team
  (t, k) => Boolean(t.claims.iss) && bare(String(t.claims.iss)) !== bare(k.c.teamDomain!),
];

/** The service-token lists, in the order a client id is looked up in them. */
const MACHINES: [Role, 'stagers' | 'posters'][] = [['stager', 'stagers'], ['poster', 'posters']];

/** Who the claims name: a listed person by email, else (only without an email) a listed machine by client id. */
function named(claims: Claims, c: AccessConfig): Caller | null {
  const email = String(claims.email ?? '').toLowerCase();
  if (email) return list(c.emails).includes(email) ? { role: 'admin', id: email } : null;
  const cn = String(claims.common_name ?? '').toLowerCase();
  const machine = cn ? MACHINES.find(([, ids]) => list(c[ids]).includes(cn)) : undefined;
  return machine ? { role: machine[0], id: cn } : null;
}

/** Whether the token is signed by the team key it names. */
async function signed(t: Token, k: Check): Promise<boolean> {
  const jwk = (await keys(k.c.teamDomain!, k.fetchFn, k.now)).find((x) => x.kid === t.head.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64(t.s), new TextEncoder().encode(`${t.h}.${t.p}`));
}

/** The caller a token names, once its claims hold and its signature checks out. Throws on a badly encoded token. */
async function callerOfToken(h: string, p: string, s: string, k: Check): Promise<Caller | null> {
  const t: Token = { h, p, s, head: part(h), claims: part(p) };
  const caller = REFUSALS.some((refuse) => refuse(t, k)) ? null : named(t.claims, k.c);
  // The keys are fetched only for a token that names someone.
  return caller && (await signed(t, k)) ? caller : null;
}

/** The caller behind a valid Access token for this app, or null. */
export async function verifyCaller(token: string | null, c: AccessConfig, fetchFn: typeof fetch = fetch, now = Date.now()): Promise<Caller | null> {
  if (!token || !accessConfigured(c)) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  return callerOfToken(h, p, s, { c, fetchFn, now }).catch(() => null);
}

/** The endpoints each machine may use, as 'METHOD path' under the API prefix; a path ending in '/' is a prefix. */
const GRANTS: Record<Exclude<Role, 'admin'>, string[]> = {
  // The producing machine: upload media, stage posts, report what is produced, read and answer motion requests.
  stager: ['PUT media/', 'POST stage', 'POST production', 'GET requests', 'POST requests'],
  // The CI poster: read the approved queue and the posting order, download media, report outcomes.
  poster: ['GET queue', 'POST posted', 'GET media/', 'GET schedule'],
};

const covers = (grant: string, method: string, sub: string) => {
  const [m, path] = grant.split(' ');
  return m === method && (path.endsWith('/') ? sub.startsWith(path) : sub === path);
};

/** Which roles may use a path (and method). People: everything. Machines: only their own endpoints. */
export function allowed(role: Role, path: string, method: string): boolean {
  if (role === 'admin') return true;
  const prefix = `${paths.api}/`;
  if (!Object.hasOwn(GRANTS, role) || !path.startsWith(prefix)) return false;
  const sub = path.slice(prefix.length);
  return GRANTS[role as keyof typeof GRANTS].some((g) => covers(g, method, sub));
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

