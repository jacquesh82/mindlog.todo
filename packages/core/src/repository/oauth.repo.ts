import { getPool } from '../db/pool.js';

export interface OAuthClient {
  clientId: string;
  clientSecretHash: string | null;
  clientName: string | null;
  redirectUris: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
}

interface ClientRow {
  client_id: string;
  client_secret_hash: string | null;
  client_name: string | null;
  redirect_uris: string[];
  grant_types: string[];
  token_endpoint_auth_method: string;
}

function mapClient(r: ClientRow): OAuthClient {
  return {
    clientId: r.client_id,
    clientSecretHash: r.client_secret_hash,
    clientName: r.client_name,
    redirectUris: r.redirect_uris,
    grantTypes: r.grant_types,
    tokenEndpointAuthMethod: r.token_endpoint_auth_method,
  };
}

export async function insertClient(input: {
  clientId: string;
  clientSecretHash: string | null;
  clientName: string | null;
  redirectUris: string[];
  grantTypes: string[];
  tokenEndpointAuthMethod: string;
}): Promise<OAuthClient> {
  const { rows } = await getPool().query<ClientRow>(
    `INSERT INTO oauth_clients
       (client_id, client_secret_hash, client_name, redirect_uris, grant_types, token_endpoint_auth_method)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING *`,
    [
      input.clientId,
      input.clientSecretHash,
      input.clientName,
      input.redirectUris,
      input.grantTypes,
      input.tokenEndpointAuthMethod,
    ],
  );
  return mapClient(rows[0]!);
}

export async function findClient(clientId: string): Promise<OAuthClient | null> {
  const { rows } = await getPool().query<ClientRow>(
    'SELECT * FROM oauth_clients WHERE client_id = $1',
    [clientId],
  );
  return rows[0] ? mapClient(rows[0]) : null;
}

export async function insertAuthCode(input: {
  codeHash: string;
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string | null;
  expiresAt: Date;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO oauth_auth_codes
       (code_hash, client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      input.codeHash,
      input.clientId,
      input.userId,
      input.redirectUri,
      input.codeChallenge,
      input.codeChallengeMethod,
      input.scope,
      input.resource,
      input.expiresAt,
    ],
  );
}

export interface ConsumedAuthCode {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  resource: string | null;
}

interface AuthCodeRow {
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  scope: string;
  resource: string | null;
}

/**
 * Atomically claim a still-valid authorization code: marks it consumed and
 * returns its payload, or null if it is unknown, expired, or already used.
 */
export async function consumeAuthCode(codeHash: string): Promise<ConsumedAuthCode | null> {
  const { rows } = await getPool().query<AuthCodeRow>(
    `UPDATE oauth_auth_codes
        SET consumed_at = now()
      WHERE code_hash = $1 AND consumed_at IS NULL AND expires_at > now()
      RETURNING client_id, user_id, redirect_uri, code_challenge, code_challenge_method, scope, resource`,
    [codeHash],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    clientId: r.client_id,
    userId: r.user_id,
    redirectUri: r.redirect_uri,
    codeChallenge: r.code_challenge,
    codeChallengeMethod: r.code_challenge_method,
    scope: r.scope,
    resource: r.resource,
  };
}
