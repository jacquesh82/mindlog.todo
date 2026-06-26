# Prompt — implement `id.mindlog.today` as an OIDC provider for mindlog apps

> Hand this to a Claude session working in the **id.mindlog.today** repo. It is
> the contract the `mindlog.todo` client already implements (see
> `packages/core/src/auth/mindlog-id.ts`). mindlog.todo speaks **standard OpenID
> Connect** and uses **discovery**, so you own the exact endpoint paths — you
> only need to expose a conformant discovery document and a registered client.

## Goal

Make `https://id.mindlog.today` a minimal, standards-compliant **OpenID Connect
provider** so any mindlog app (starting with mindlog.todo) can offer
"Sign in with mindlog id" via the **Authorization Code flow** with a
**confidential client** (client secret).

## What the client already does (do not change app-side)

1. Fetches `GET {issuer}/.well-known/openid-configuration` and reads
   `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`.
2. Redirects the browser to `authorization_endpoint` with:
   `response_type=code`, `client_id`, `redirect_uri`, `scope=openid email profile`,
   `state`.
3. On callback, POSTs to `token_endpoint`
   (`application/x-www-form-urlencoded`) with
   `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`,
   `client_secret`.
4. Calls `GET userinfo_endpoint` with `Authorization: Bearer {access_token}`
   and expects JSON `{ "sub", "email", "name" }`.

## Deliverables

### 1. Discovery document
`GET /.well-known/openid-configuration` → JSON including at least:

```json
{
  "issuer": "https://id.mindlog.today",
  "authorization_endpoint": "https://id.mindlog.today/<your-path>/authorize",
  "token_endpoint": "https://id.mindlog.today/<your-path>/token",
  "userinfo_endpoint": "https://id.mindlog.today/<your-path>/userinfo",
  "jwks_uri": "https://id.mindlog.today/<your-path>/jwks",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "scopes_supported": ["openid", "email", "profile"],
  "subject_types_supported": ["public"],
  "id_token_signing_alg_values_supported": ["RS256"],
  "token_endpoint_auth_methods_supported": ["client_secret_post", "client_secret_basic"],
  "code_challenge_methods_supported": ["S256"]
}
```

### 2. Client registration
Register one **confidential** client for mindlog.todo:
- `client_id` + `client_secret` (return these to me — they become
  `MINDLOG_ID_CLIENT_ID` / `MINDLOG_ID_CLIENT_SECRET` in mindlog.todo).
- Allowed `redirect_uri`s (exact match):
  - prod: `https://<mindlog-todo-api-domain>/api/v1/auth/mindlog-id/callback`
  - dev:  `http://localhost:8080/api/v1/auth/mindlog-id/callback`
- Allowed scopes: `openid email profile`. Grant: `authorization_code`.

### 3. Authorization endpoint
- Authenticate the user (login UI), then redirect back to `redirect_uri` with
  `?code=...&state=...` (echo `state` verbatim).
- Validate `redirect_uri` against the registered list. Reject unknown clients.
- **Recommended:** accept and enforce PKCE (`code_challenge` / `S256`).

### 4. Token endpoint
- Accept the `authorization_code` grant, authenticate the client via secret
  (Basic header or POST body), verify `redirect_uri` matches, enforce one-time
  short-lived codes.
- Return `{ access_token, token_type: "Bearer", expires_in, id_token, scope }`.
  `id_token` is a JWT signed with the key published at `jwks_uri`, containing at
  least `sub`, `email`, `email_verified`, `name`, `iss`, `aud`, `iat`, `exp`.

### 5. UserInfo endpoint
- `GET` with `Authorization: Bearer {access_token}` → `200`
  `{ "sub", "email", "email_verified", "name", "picture"? }`.
- `sub` must be **stable and unique per user** (mindlog.todo links accounts by
  `sub`, then falls back to `email`).

## Acceptance test (end-to-end)
1. Hit `https://todo.mindlog.today/.../auth/mindlog-id` → lands on id.mindlog.today login.
2. After login, redirected back, mindlog.todo session established.
3. A second app reusing the same `sub` resolves to the same identity.

## Notes
- Keep claims minimal (email + profile). No app-specific data in the IdP.
- HTTPS only in prod; rotateable signing keys via `jwks_uri`.
- If you later want mindlog.todo to **delegate password reset** to the IdP too,
  expose a `https://id.mindlog.today/forgot` page and I'll point the app's
  "Forgot password?" there instead of its built-in flow.
