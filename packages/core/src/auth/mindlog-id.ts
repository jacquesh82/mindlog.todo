import { config } from '../config.js';

// OIDC client for the central mindlog identity provider (id.mindlog.today).
// We rely on standard OpenID Connect discovery so the provider owns its exact
// endpoint paths — we only need its issuer URL plus a registered client.

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

export interface MindlogIdProfile {
  sub: string;
  email: string;
  name?: string | null;
}

let discoveryCache: OidcDiscovery | null = null;

async function discover(): Promise<OidcDiscovery> {
  if (discoveryCache) return discoveryCache;
  const url = `${config.mindlogId.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`mindlog id discovery failed (${res.status})`);
  const doc = (await res.json()) as Partial<OidcDiscovery>;
  if (!doc.authorization_endpoint || !doc.token_endpoint || !doc.userinfo_endpoint) {
    throw new Error('mindlog id discovery document is missing required endpoints');
  }
  discoveryCache = {
    authorization_endpoint: doc.authorization_endpoint,
    token_endpoint: doc.token_endpoint,
    userinfo_endpoint: doc.userinfo_endpoint,
  };
  return discoveryCache;
}

/** Build the provider authorization URL (Authorization Code flow). */
export async function getMindlogIdAuthUrl(state: string): Promise<string> {
  const { authorization_endpoint } = await discover();
  const params = new URLSearchParams({
    client_id: config.mindlogId.clientId,
    redirect_uri: config.mindlogId.redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
  });
  return `${authorization_endpoint}?${params.toString()}`;
}

/** Exchange an authorization code for the user's profile (sub, email, name). */
export async function exchangeMindlogIdCode(code: string): Promise<MindlogIdProfile> {
  const { token_endpoint, userinfo_endpoint } = await discover();
  const tokenRes = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.mindlogId.redirectUri,
      client_id: config.mindlogId.clientId,
      client_secret: config.mindlogId.clientSecret,
    }).toString(),
  });
  if (!tokenRes.ok) throw new Error(`mindlog id token exchange failed (${tokenRes.status})`);
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error('mindlog id token response missing access_token');

  const userRes = await fetch(userinfo_endpoint, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) throw new Error(`mindlog id userinfo failed (${userRes.status})`);
  const profile = (await userRes.json()) as { sub?: string; email?: string; name?: string };
  if (!profile.sub || !profile.email) throw new Error('mindlog id profile missing sub/email');
  return { sub: profile.sub, email: profile.email, name: profile.name ?? null };
}
