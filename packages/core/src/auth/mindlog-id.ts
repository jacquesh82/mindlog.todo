import { config } from '../config.js';

// OIDC client for the central mindlog identity provider (id.mindlog.today).
// We rely on standard OpenID Connect discovery so the provider owns its exact
// endpoint paths — we only need its issuer URL plus a registered client.

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

/** OAuth tokens + granted scope returned by the mindlog id token endpoint. */
export interface MindlogIdTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  /** Space-separated scopes actually granted (selective consent). */
  scope: string;
}

export interface MindlogIdProfile extends MindlogIdTokens {
  sub: string;
  // mindlog accounts are handle-based; the email (recovery email) is optional on
  // the IdP, so it may be absent. The caller then asks the user for one.
  email: string | null;
  name?: string | null;
  /** Avatar URL from the OIDC `picture` claim, if the IdP exposes one. */
  picture?: string | null;
}

/** Optional scope that grants read access to the user's mindlog id agenda. */
export const MINDLOG_ID_AGENDA_SCOPE = 'mindlog:agenda';

/** True when the granted scope string includes the agenda read permission. */
export function hasAgendaScope(scope: string): boolean {
  return scope.split(/\s+/).includes(MINDLOG_ID_AGENDA_SCOPE);
}

/** A single agenda event as returned by mindlog id's GET /oauth/agenda. */
export interface MindlogIdEvent {
  id: number;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  link: string;
  is_public: boolean;
  kind: 'event' | 'live';
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
    // openid/email/profile : login OIDC ; mindlog:agenda/relations : accès optionnel
    // proposé (et décochable) sur l'écran de consentement sélectif de mindlog.id.
    scope: 'openid email profile mindlog:agenda mindlog:relations',
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
  const tokens = (await tokenRes.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!tokens.access_token) throw new Error('mindlog id token response missing access_token');

  const userRes = await fetch(userinfo_endpoint, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  });
  if (!userRes.ok) throw new Error(`mindlog id userinfo failed (${userRes.status})`);
  const profile = (await userRes.json()) as {
    sub?: string;
    email?: string;
    name?: string;
    picture?: string;
  };
  // sub is the stable identifier and is always present; email is optional (the
  // caller collects one from the user when it's missing).
  if (!profile.sub) throw new Error('mindlog id profile missing sub');
  return {
    sub: profile.sub,
    email: profile.email ?? null,
    name: profile.name ?? null,
    picture: profile.picture ?? null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? '',
    expiresIn: tokens.expires_in ?? 3600,
    scope: tokens.scope ?? '',
  };
}

/** Exchange a refresh token for a fresh access/refresh token pair (rotation). */
export async function refreshMindlogIdToken(refreshToken: string): Promise<MindlogIdTokens> {
  const { token_endpoint } = await discover();
  const res = await fetch(token_endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.mindlogId.clientId,
      client_secret: config.mindlogId.clientSecret,
    }).toString(),
  });
  if (!res.ok) throw new Error(`mindlog id token refresh failed (${res.status})`);
  const t = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  if (!t.access_token) throw new Error('mindlog id refresh response missing access_token');
  return {
    accessToken: t.access_token,
    // The IdP rotates refresh tokens; keep the old one if it ever omits a new one.
    refreshToken: t.refresh_token ?? refreshToken,
    expiresIn: t.expires_in ?? 3600,
    scope: t.scope ?? '',
  };
}

/**
 * Fetch the user's mindlog id agenda. Requires an access token whose grant
 * included {@link MINDLOG_ID_AGENDA_SCOPE}; a 403 means the right was not given.
 */
export async function fetchMindlogIdAgenda(accessToken: string): Promise<MindlogIdEvent[]> {
  const base = config.mindlogId.issuer.replace(/\/$/, '');
  const res = await fetch(`${base}/oauth/agenda`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 401) throw new MindlogIdAuthError('access token rejected');
  if (res.status === 403) throw new MindlogIdScopeError('agenda scope not granted');
  if (!res.ok) throw new Error(`mindlog id agenda failed (${res.status})`);
  const body = (await res.json()) as { events?: MindlogIdEvent[] };
  return body.events ?? [];
}

/** Access token is invalid/expired — the caller should try a refresh. */
export class MindlogIdAuthError extends Error {}
/** The agenda scope was not granted — the caller should surface "right missing". */
export class MindlogIdScopeError extends Error {}

/**
 * Store the email the user typed as their mindlog id recovery email, so the
 * central identity becomes the single source of truth (best-effort: the IdP
 * won't overwrite an existing email and a failure must not block login).
 */
export async function setMindlogIdRecoveryEmail(accessToken: string, email: string): Promise<void> {
  const base = config.mindlogId.issuer.replace(/\/$/, '');
  const res = await fetch(`${base}/oauth/recovery-email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) throw new Error(`mindlog id recovery-email failed (${res.status})`);
}
