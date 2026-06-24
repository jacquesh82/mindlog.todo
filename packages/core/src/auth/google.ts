import { OAuth2Client } from 'google-auth-library';
import { config, googleEnabled } from '../config.js';
import { BadRequest, ServiceUnavailable } from '../errors.js';

let client: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!googleEnabled()) {
    throw ServiceUnavailable('Google OAuth is not configured');
  }
  if (!client) {
    client = new OAuth2Client({
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
      redirectUri: config.google.redirectUri,
    });
  }
  return client;
}

export function getGoogleAuthUrl(state: string): string {
  return getClient().generateAuthUrl({
    scope: ['openid', 'email', 'profile'],
    state,
    access_type: 'online',
    prompt: 'select_account',
  });
}

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleProfile> {
  const c = getClient();
  const { tokens } = await c.getToken(code);
  if (!tokens.id_token) throw BadRequest('Google did not return an id_token');

  const ticket = await c.verifyIdToken({
    idToken: tokens.id_token,
    audience: config.google.clientId,
  });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw BadRequest('Google profile missing subject or email');
  }
  return { sub: payload.sub, email: payload.email, name: payload.name ?? null };
}
