#!/usr/bin/env bash
# Generate a TLS certificate for local HTTPS at https://todo.mindlog.localhost.
# Prefers mkcert (produces a locally-trusted cert, no browser warning); falls
# back to a self-signed openssl cert (browser will show a warning you can accept).
set -euo pipefail

DOMAIN="todo.mindlog.localhost"
DIR="$(cd "$(dirname "$0")/.." && pwd)/certs"
mkdir -p "$DIR"

if command -v mkcert >/dev/null 2>&1; then
  echo "Using mkcert (locally trusted CA)…"
  mkcert -install
  mkcert -cert-file "$DIR/cert.pem" -key-file "$DIR/key.pem" "$DOMAIN" localhost 127.0.0.1
else
  echo "mkcert not found — generating a self-signed certificate with openssl."
  echo "(Tip: install mkcert for a browser-trusted cert.)"
  openssl req -x509 -nodes -newkey rsa:2048 -days 825 \
    -keyout "$DIR/key.pem" -out "$DIR/cert.pem" \
    -subj "/CN=${DOMAIN}" \
    -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1"
fi

echo "Certificate written to ${DIR}/cert.pem and ${DIR}/key.pem"
