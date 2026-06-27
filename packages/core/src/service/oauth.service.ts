import { createHash, randomBytes } from 'node:crypto';
import { sha256 } from '../auth/tokens.js';
import { config } from '../config.js';
import type { AuthResult } from '../domain/user.js';
import * as oauthRepo from '../repository/oauth.repo.js';
import { issueTokensForUserId, refresh as refreshSession } from './auth.service.js';

/**
 * mindlog.todo as an OAuth 2.1 authorization server for remote MCP clients.
 *
 * The same deployment is both the Authorization Server and the Resource Server:
 * issued access tokens are the regular app JWTs (validated by the MCP endpoint
 * via `verifyAccessToken`). Public clients (e.g. Claude) authenticate with PKCE
 * and hold no secret. The browser-facing consent step is delegated to the web
 * SPA; everything here is the protocol machinery.
 */

const SUPPORTED_SCOPES = ['mcp', 'offline_access'] as const;
const AUTH_CODE_TTL_MS = 5 * 60_000;

/** An RFC 6749 error response carrier (`error` + optional `error_description`). */
export class OAuthError extends Error {
  constructor(
    readonly status: number,
    readonly error: string,
    readonly description?: string,
  ) {
    super(description ?? error);
  }
}

// --- discovery metadata -----------------------------------------------------

function base(): string {
  return config.publicUrl.replace(/\/$/, '');
}

/** RFC 8414 Authorization Server Metadata. */
export function authorizationServerMetadata() {
  const b = base();
  return {
    issuer: b,
    authorization_endpoint: `${b}/oauth/authorize`,
    token_endpoint: `${b}/oauth/token`,
    registration_endpoint: `${b}/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: SUPPORTED_SCOPES,
  };
}

/** RFC 9728 Protected Resource Metadata for the `/mcp` resource. */
export function protectedResourceMetadata() {
  const b = base();
  return {
    resource: `${b}/mcp`,
    authorization_servers: [b],
    bearer_methods_supported: ['header'],
    scopes_supported: SUPPORTED_SCOPES,
  };
}

// --- dynamic client registration (RFC 7591) ---------------------------------

export interface RegisterClientInput {
  clientName?: string | null;
  redirectUris: string[];
  grantTypes?: string[];
  tokenEndpointAuthMethod?: string;
}

export async function registerClient(input: RegisterClientInput) {
  if (!Array.isArray(input.redirectUris) || input.redirectUris.length === 0) {
    throw new OAuthError(400, 'invalid_redirect_uri', 'redirect_uris is required');
  }
  for (const uri of input.redirectUris) {
    try {
      new URL(uri);
    } catch {
      throw new OAuthError(400, 'invalid_redirect_uri', `Invalid redirect_uri: ${uri}`);
    }
  }

  const method = input.tokenEndpointAuthMethod ?? 'none';
  const grantTypes = input.grantTypes?.length
    ? input.grantTypes
    : ['authorization_code', 'refresh_token'];
  const clientId = `mcp_${randomBytes(16).toString('base64url')}`;

  let secret: string | null = null;
  let secretHash: string | null = null;
  if (method !== 'none') {
    secret = randomBytes(32).toString('base64url');
    secretHash = sha256(secret);
  }

  await oauthRepo.insertClient({
    clientId,
    clientSecretHash: secretHash,
    clientName: input.clientName ?? null,
    redirectUris: input.redirectUris,
    grantTypes,
    tokenEndpointAuthMethod: method,
  });

  return {
    client_id: clientId,
    ...(secret ? { client_secret: secret } : {}),
    client_name: input.clientName ?? undefined,
    redirect_uris: input.redirectUris,
    grant_types: grantTypes,
    response_types: ['code'],
    token_endpoint_auth_method: method,
  };
}

// --- authorization endpoint -------------------------------------------------

export interface AuthorizationRequest {
  clientId: string;
  redirectUri: string;
  responseType: string;
  codeChallenge: string;
  codeChallengeMethod?: string;
  scope?: string;
  state?: string;
  resource?: string;
}

/**
 * Validate an `/authorize` request. Throws {@link OAuthError} when the client or
 * redirect_uri is untrusted (the caller must NOT redirect back in that case).
 */
export async function validateAuthorizationRequest(
  p: Pick<
    AuthorizationRequest,
    'clientId' | 'redirectUri' | 'responseType' | 'codeChallenge' | 'codeChallengeMethod'
  >,
): Promise<oauthRepo.OAuthClient> {
  if (!p.clientId) throw new OAuthError(400, 'invalid_request', 'client_id is required');
  const client = await oauthRepo.findClient(p.clientId);
  if (!client) throw new OAuthError(400, 'invalid_client', 'Unknown client');
  if (!p.redirectUri || !client.redirectUris.includes(p.redirectUri)) {
    throw new OAuthError(400, 'invalid_request', 'redirect_uri is not registered for this client');
  }
  if (p.responseType !== 'code') {
    throw new OAuthError(400, 'unsupported_response_type', 'Only response_type=code is supported');
  }
  if (!p.codeChallenge) {
    throw new OAuthError(400, 'invalid_request', 'PKCE code_challenge is required');
  }
  if (p.codeChallengeMethod && p.codeChallengeMethod !== 'S256') {
    throw new OAuthError(400, 'invalid_request', 'Only the S256 PKCE method is supported');
  }
  return client;
}

/**
 * Build the URL to redirect the user back to after the consent screen. On
 * approval it mints a single-use authorization code bound to the user + PKCE
 * challenge; on denial it returns `error=access_denied`.
 */
export async function buildConsentRedirect(
  p: AuthorizationRequest & { approve: boolean; userId: string },
): Promise<string> {
  const client = await validateAuthorizationRequest(p);
  const url = new URL(p.redirectUri);

  if (!p.approve) {
    url.searchParams.set('error', 'access_denied');
    if (p.state) url.searchParams.set('state', p.state);
    return url.toString();
  }

  const code = randomBytes(32).toString('base64url');
  await oauthRepo.insertAuthCode({
    codeHash: sha256(code),
    clientId: client.clientId,
    userId: p.userId,
    redirectUri: p.redirectUri,
    codeChallenge: p.codeChallenge,
    codeChallengeMethod: p.codeChallengeMethod || 'S256',
    scope: p.scope ?? '',
    resource: p.resource ?? null,
    expiresAt: new Date(Date.now() + AUTH_CODE_TTL_MS),
  });

  url.searchParams.set('code', code);
  if (p.state) url.searchParams.set('state', p.state);
  return url.toString();
}

// --- token endpoint ---------------------------------------------------------

export interface TokenRequest {
  grantType: string;
  code?: string;
  redirectUri?: string;
  clientId?: string;
  clientSecret?: string;
  codeVerifier?: string;
  refreshToken?: string;
}

export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope?: string;
}

function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method === 'plain') return verifier === challenge;
  return createHash('sha256').update(verifier).digest('base64url') === challenge;
}

function toTokenResponse(session: AuthResult, scope?: string): OAuthTokenResponse {
  return {
    access_token: session.accessToken,
    token_type: 'Bearer',
    expires_in: session.expiresIn,
    refresh_token: session.refreshToken,
    ...(scope ? { scope } : {}),
  };
}

export async function exchangeToken(p: TokenRequest): Promise<OAuthTokenResponse> {
  if (p.grantType === 'authorization_code') {
    if (!p.code) throw new OAuthError(400, 'invalid_request', 'code is required');
    if (!p.codeVerifier) throw new OAuthError(400, 'invalid_request', 'code_verifier is required');

    const claimed = await oauthRepo.consumeAuthCode(sha256(p.code));
    if (!claimed) {
      throw new OAuthError(400, 'invalid_grant', 'Authorization code is invalid or expired');
    }
    if (p.clientId && p.clientId !== claimed.clientId) {
      throw new OAuthError(400, 'invalid_grant', 'client_id does not match the authorization code');
    }
    if (p.redirectUri !== claimed.redirectUri) {
      throw new OAuthError(400, 'invalid_grant', 'redirect_uri does not match the authorization code');
    }

    const client = await oauthRepo.findClient(claimed.clientId);
    if (!client) throw new OAuthError(400, 'invalid_client', 'Unknown client');
    if (client.clientSecretHash) {
      if (!p.clientSecret || sha256(p.clientSecret) !== client.clientSecretHash) {
        throw new OAuthError(401, 'invalid_client', 'Invalid client credentials');
      }
    }
    if (!verifyPkce(p.codeVerifier, claimed.codeChallenge, claimed.codeChallengeMethod)) {
      throw new OAuthError(400, 'invalid_grant', 'PKCE verification failed');
    }

    const session = await issueTokensForUserId(claimed.userId);
    return toTokenResponse(session, claimed.scope || undefined);
  }

  if (p.grantType === 'refresh_token') {
    if (!p.refreshToken) throw new OAuthError(400, 'invalid_request', 'refresh_token is required');
    let session: AuthResult;
    try {
      session = await refreshSession(p.refreshToken);
    } catch {
      throw new OAuthError(400, 'invalid_grant', 'Refresh token is invalid or expired');
    }
    return toTokenResponse(session);
  }

  throw new OAuthError(400, 'unsupported_grant_type', `Unsupported grant_type: ${p.grantType}`);
}
