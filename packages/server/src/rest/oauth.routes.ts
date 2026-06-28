import { config, OAuthError, oauthService } from '@mindlog/core';
import { Router, type Request, type Response } from 'express';
import { requireAuth, userId } from '../middleware/auth.js';

/** First value of a query/body field as a string, or undefined. */
function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

/** Emit an RFC 6749 error body, or rethrow non-OAuth errors to the global handler. */
function sendOAuthError(res: Response, err: unknown): void {
  if (err instanceof OAuthError) {
    res.status(err.status).json({ error: err.error, error_description: err.description });
    return;
  }
  throw err;
}

/**
 * Public (unauthenticated) OAuth + discovery endpoints, mounted at the root so
 * the `.well-known` documents live where clients expect them.
 */
export const oauthRouter: Router = Router();

// --- discovery metadata ---

oauthRouter.get('/.well-known/oauth-authorization-server', (_req, res) => {
  res.json(oauthService.authorizationServerMetadata());
});

// Some clients probe the OIDC discovery doc; the AS metadata is a valid superset.
oauthRouter.get('/.well-known/openid-configuration', (_req, res) => {
  res.json(oauthService.authorizationServerMetadata());
});

oauthRouter.get('/.well-known/oauth-protected-resource', (_req, res) => {
  res.json(oauthService.protectedResourceMetadata());
});

// Path-specific variant for the `/mcp` resource (RFC 9728).
oauthRouter.get('/.well-known/oauth-protected-resource/mcp', (_req, res) => {
  res.json(oauthService.protectedResourceMetadata());
});

// --- dynamic client registration (RFC 7591) ---

oauthRouter.post('/oauth/register', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const registration = await oauthService.registerClient({
      clientName: str(body.client_name) ?? null,
      redirectUris: Array.isArray(body.redirect_uris) ? (body.redirect_uris as string[]) : [],
      grantTypes: Array.isArray(body.grant_types) ? (body.grant_types as string[]) : undefined,
      tokenEndpointAuthMethod: str(body.token_endpoint_auth_method),
    });
    res.status(201).json(registration);
  } catch (err) {
    sendOAuthError(res, err);
  }
});

// --- authorization endpoint (browser entry point) ---

oauthRouter.get('/oauth/authorize', async (req: Request, res: Response) => {
  try {
    await oauthService.validateAuthorizationRequest({
      clientId: str(req.query.client_id) ?? '',
      redirectUri: str(req.query.redirect_uri) ?? '',
      responseType: str(req.query.response_type) ?? '',
      codeChallenge: str(req.query.code_challenge) ?? '',
      codeChallengeMethod: str(req.query.code_challenge_method),
    });
  } catch (err) {
    if (err instanceof OAuthError) {
      // Untrusted client/redirect: must not redirect back — show a plain error.
      res
        .status(err.status)
        .type('html')
        .send(`<!doctype html><meta charset="utf-8"><title>Authorization error</title>
          <body style="font-family:system-ui;padding:2rem">
            <h1>Authorization error</h1><p>${err.error}: ${err.description ?? ''}</p>
          </body>`);
      return;
    }
    throw err;
  }

  // Hand off to the web SPA consent screen, preserving the original parameters.
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(req.query)) {
    const s = str(v);
    if (s !== undefined) qs.set(k, s);
  }
  res.redirect(`${config.webUrl.replace(/\/$/, '')}/authorize?${qs.toString()}`);
});

// --- token endpoint ---

oauthRouter.post('/oauth/token', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const tokens = await oauthService.exchangeToken({
      grantType: str(body.grant_type) ?? '',
      code: str(body.code),
      redirectUri: str(body.redirect_uri),
      clientId: str(body.client_id),
      clientSecret: str(body.client_secret),
      codeVerifier: str(body.code_verifier),
      refreshToken: str(body.refresh_token),
    });
    // Token responses must not be cached (RFC 6749 §5.1).
    res.set('Cache-Control', 'no-store').json(tokens);
  } catch (err) {
    sendOAuthError(res, err);
  }
});

/**
 * Authenticated consent endpoint, called by the web SPA once the signed-in user
 * approves (or denies). Mounted at `/api/v1/oauth` so its `requireAuth` only
 * guards this route (not every `/api/v1` request). Returns the URL to redirect
 * the browser back to.
 */
export const oauthConsentRouter: Router = Router();
oauthConsentRouter.use(requireAuth);

oauthConsentRouter.post('/authorize', async (req, res) => {
  try {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const redirectTo = await oauthService.buildConsentRedirect({
      approve: body.approve === true,
      userId: userId(req),
      clientId: str(body.clientId) ?? '',
      redirectUri: str(body.redirectUri) ?? '',
      responseType: str(body.responseType) ?? 'code',
      codeChallenge: str(body.codeChallenge) ?? '',
      codeChallengeMethod: str(body.codeChallengeMethod),
      scope: str(body.scope),
      state: str(body.state),
      resource: str(body.resource),
    });
    res.json({ redirectTo });
  } catch (err) {
    sendOAuthError(res, err);
  }
});

// Claude's MCP OAuth callback(s). Pre-registering a client with these redirect
// URIs lets the user paste a Client ID/Secret into the connector dialog and skip
// Dynamic Client Registration.
const CLAUDE_REDIRECT_URIS = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
];

/**
 * Convenience: register a confidential OAuth client pre-configured for Claude,
 * returning the client_id + client_secret to display once in the settings card.
 */
oauthConsentRouter.post('/clients', async (_req, res) => {
  try {
    const registration = await oauthService.registerClient({
      clientName: 'mindlog.todo — Claude connector',
      redirectUris: CLAUDE_REDIRECT_URIS,
      tokenEndpointAuthMethod: 'client_secret_post',
    });
    res.status(201).json(registration);
  } catch (err) {
    sendOAuthError(res, err);
  }
});
