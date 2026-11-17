import { beforeEach, describe, expect, it } from 'vitest';
import { allowed, callerOf, configurePaths, isAdminPath, resetAccessCache, verifyCaller } from '../src/access.js';

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1' };
const certs = (async () => new Response(JSON.stringify({ keys: [jwk] }))) as unknown as typeof fetch;
async function token(claims: Record<string, unknown>, kid = 'k1') {
  const h = enc({ alg: 'RS256', kid }), p = enc(claims);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${Buffer.from(sig).toString('base64url')}`;
}
const config = { teamDomain: 'team.cloudflareaccess.com', aud: 'aud1', emails: 'admin@example.com', stagers: 'mac-id.access', posters: 'gh-id.access' };
const exp = Math.floor(Date.now() / 1000) + 600;

describe('admin access', () => {
  beforeEach(() => resetAccessCache());
  it('lets in the listed person and the two service tokens, each as its role', async () => {
    expect(await verifyCaller(await token({ aud: ['aud1'], exp, email: 'Admin@example.com', iss: 'https://team.cloudflareaccess.com' }), config, certs)).toEqual({ role: 'admin', id: 'admin@example.com' });
    expect(await verifyCaller(await token({ aud: 'aud1', exp, common_name: 'mac-id.access' }), config, certs)).toEqual({ role: 'stager', id: 'mac-id.access' });
    expect(await verifyCaller(await token({ aud: 'aud1', exp, common_name: 'gh-id.access' }), config, certs)).toEqual({ role: 'poster', id: 'gh-id.access' });
  });
  it('refuses anyone else, a wrong audience or issuer, an expired or forged token, and missing config', async () => {
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'someone@example.com' }), config, certs)).toBeNull();
    expect(await verifyCaller(await token({ aud: 'other', exp, email: 'admin@example.com' }), config, certs)).toBeNull();
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'admin@example.com', iss: 'https://evil.cloudflareaccess.com' }), config, certs)).toBeNull();
    expect(await verifyCaller(await token({ aud: 'aud1', exp: 1, email: 'admin@example.com' }), config, certs)).toBeNull();
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'admin@example.com' }, 'nope'), config, certs)).toBeNull();
    const good = await token({ aud: 'aud1', exp, email: 'admin@example.com' });
    const [h, , s] = good.split('.');
    expect(await verifyCaller(`${h}.${enc({ aud: 'aud1', exp, email: 'admin@example.com', x: 1 })}.${s}`, config, certs)).toBeNull();
    expect(await verifyCaller(good, { ...config, aud: '' }, certs)).toBeNull();
    expect(await verifyCaller(null, config, certs)).toBeNull();
  });
  it('gives each machine only its own endpoints, and never approval', () => {
    expect(allowed('stager', '/api/admin/media/a/short.mp4', 'PUT')).toBe(true);
    expect(allowed('stager', '/api/admin/stage', 'POST')).toBe(true);
    expect(allowed('stager', '/api/admin/queue', 'GET')).toBe(false);
    expect(allowed('poster', '/api/admin/queue', 'GET')).toBe(true);
    expect(allowed('poster', '/api/admin/posted', 'POST')).toBe(true);
    expect(allowed('poster', '/api/admin/media/a/short.mp4', 'GET')).toBe(true);
    expect(allowed('poster', '/api/admin/stage', 'POST')).toBe(false);
    expect(allowed('poster', '/api/admin/schedule', 'GET')).toBe(true);
    expect(allowed('stager', '/api/admin/production', 'POST')).toBe(true);
    expect(allowed('stager', '/api/admin/requests', 'POST')).toBe(true);
    expect(allowed('poster', '/api/admin/requests', 'GET')).toBe(false);
    expect(allowed('stager', '/api/admin/schedule', 'GET')).toBe(false);
    for (const r of ['stager', 'poster'] as const) {
      expect(allowed(r, '/admin', 'GET')).toBe(false);
      expect(allowed(r, '/admin', 'POST')).toBe(false);
    }
    expect(allowed('admin', '/admin', 'POST')).toBe(true);
  });
});

describe('admin access, every branch', () => {
  beforeEach(() => resetAccessCache());
  const counting = () => {
    const calls: string[] = [];
    const f = (async (url: string) => { calls.push(String(url)); return new Response(JSON.stringify({ keys: [jwk] })); }) as unknown as typeof fetch;
    return { calls, f };
  };

  it('allows exactly this table of role, path and method', () => {
    const a = '/api/admin';
    const subs = ['queue', 'posted', 'stage', 'production', 'schedule', 'requests', 'media/a/b.mp4', 'nope'];
    const grant: Record<string, string[]> = {
      stager: ['PUT media/a/b.mp4', 'POST stage', 'POST production', 'GET requests', 'POST requests'],
      poster: ['GET queue', 'POST posted', 'GET media/a/b.mp4', 'GET schedule'],
    };
    for (const role of ['stager', 'poster'] as const)
      for (const sub of subs)
        for (const m of ['GET', 'POST', 'PUT', 'DELETE'])
          expect(allowed(role, `${a}/${sub}`, m), `${role} ${m} ${sub}`).toBe(grant[role].includes(`${m} ${sub}`));
    expect(allowed('stager', `${a}/media`, 'PUT')).toBe(false);
    expect(allowed('poster', `${a}/queue/x`, 'GET')).toBe(false);
    expect(allowed('poster', `/elsewhere${a}/queue`, 'GET')).toBe(false);
    expect(allowed('admin', '/anything', 'DELETE')).toBe(true);
    expect(allowed('nobody' as never, `${a}/queue`, 'GET')).toBe(false);
  });

  it('follows configured paths', () => {
    configurePaths({ api: '/desk/api', admin: '/desk' });
    try {
      expect(allowed('poster', '/desk/api/queue', 'GET')).toBe(true);
      expect(allowed('poster', '/api/admin/queue', 'GET')).toBe(false);
      expect(isAdminPath('/desk')).toBe(true);
      expect(isAdminPath('/desk/x')).toBe(true);
      expect(isAdminPath('/desk/api/queue')).toBe(true);
      expect(isAdminPath('/desktop')).toBe(false);
    } finally { configurePaths({ api: '/api/admin', admin: '/admin' }); }
  });

  it('refuses malformed tokens and other algorithms', async () => {
    const good = await token({ aud: 'aud1', exp, email: 'admin@example.com' });
    const [h, p, s] = good.split('.');
    expect(await verifyCaller(`${h}.${p}`, config, certs)).toBeNull();
    expect(await verifyCaller(`${h}..${s}`, config, certs)).toBeNull();
    expect(await verifyCaller(`!!!.${p}.${s}`, config, certs)).toBeNull();
    expect(await verifyCaller(`${enc({ alg: 'HS256', kid: 'k1' })}.${p}.${s}`, config, certs)).toBeNull();
    expect(await verifyCaller('', config, certs)).toBeNull();
  });

  it('needs a numeric exp and accepts any listed audience, case-insensitively', async () => {
    expect(await verifyCaller(await token({ aud: 'aud1', exp: String(exp), email: 'admin@example.com' }), config, certs)).toBeNull();
    expect(await verifyCaller(await token({ aud: 'aud1', email: 'admin@example.com' }), config, certs)).toBeNull();
    const c2 = { ...config, aud: 'other, AUD1' };
    expect(await verifyCaller(await token({ aud: ['x', 'Aud1'], exp, email: 'admin@example.com' }), c2, certs)).toEqual({ role: 'admin', id: 'admin@example.com' });
  });

  it('compares the issuer without scheme or trailing slash, and skips it when absent', async () => {
    const c2 = { ...config, teamDomain: 'https://team.cloudflareaccess.com/' };
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'admin@example.com', iss: 'http://team.cloudflareaccess.com/' }), c2, certs)).toEqual({ role: 'admin', id: 'admin@example.com' });
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'admin@example.com', iss: '' }), config, certs)).toEqual({ role: 'admin', id: 'admin@example.com' });
  });

  it('gives a token with an email no machine role, and prefers stager when a client id is in both lists', async () => {
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'x@example.com', common_name: 'mac-id.access' }), config, certs)).toBeNull();
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'admin@example.com', common_name: 'mac-id.access' }), config, certs)).toEqual({ role: 'admin', id: 'admin@example.com' });
    const both = { ...config, posters: 'mac-id.access' };
    expect(await verifyCaller(await token({ aud: 'aud1', exp, common_name: 'MAC-ID.access' }), both, certs)).toEqual({ role: 'stager', id: 'mac-id.access' });
    expect(await verifyCaller(await token({ aud: 'aud1', exp }), config, certs)).toBeNull();
  });

  it('does not fetch keys for a token that names no one, and refuses when the keys cannot be fetched', async () => {
    const { calls, f } = counting();
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'x@example.com' }), config, f)).toBeNull();
    expect(calls).toEqual([]);
    const down = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
    expect(await verifyCaller(await token({ aud: 'aud1', exp, email: 'admin@example.com' }), config, down)).toBeNull();
  });

  it('caches the keys for an hour per team', async () => {
    const { calls, f } = counting();
    const t = await token({ aud: 'aud1', exp: exp + 7200, email: 'admin@example.com' });
    const now = Date.now();
    await verifyCaller(t, config, f, now);
    await verifyCaller(t, config, f, now + 3_599_999);
    expect(calls).toEqual(['https://team.cloudflareaccess.com/cdn-cgi/access/certs']);
    await verifyCaller(t, config, f, now + 3_600_000);
    expect(calls).toHaveLength(2);
    await verifyCaller(t, { ...config, teamDomain: 'https://team.cloudflareaccess.com/' }, f, now + 3_600_001);
    expect(calls).toHaveLength(2);
  });

  it('callerOf: dev admin only when Access is not configured; else the verified token', async () => {
    const req = new Request('https://site.test/admin');
    expect(await callerOf(req, {}, { dev: true })).toEqual({ role: 'admin', id: 'dev@localhost' });
    expect(await callerOf(req, {})).toBeNull();
    expect(await callerOf(req, config, { dev: true, fetch: certs })).toBeNull();
    const t = await token({ aud: 'aud1', exp, email: 'admin@example.com' });
    expect(await callerOf(new Request('https://site.test/admin', { headers: { 'cf-access-jwt-assertion': t } }), config, { fetch: certs })).toEqual({ role: 'admin', id: 'admin@example.com' });
  });
});
