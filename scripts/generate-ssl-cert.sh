#!/usr/bin/env bash

# Generate self-signed SSL certificate for local HTTPS

set -euo pipefail

SSL_DIR="./ssl"
DOMAIN=${1:-admin.ampedlogix.com}

echo "Generating self-signed SSL certificate for $DOMAIN..."

mkdir -p "$SSL_DIR"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "$SSL_DIR/key.pem" \
  -out "$SSL_DIR/cert.pem" \
  -subj "/C=US/ST=State/L=City/O=Organization/CN=$DOMAIN" \
  -addext "subjectAltName=DNS:$DOMAIN,DNS:*.$DOMAIN"

chmod 644 "$SSL_DIR/cert.pem"
chmod 600 "$SSL_DIR/key.pem"

echo "✓ SSL certificate generated in $SSL_DIR/"
echo ""
echo "Note: This is a self-signed certificate."
echo "Browsers will show a security warning - click 'Advanced' and 'Proceed'."
echo "For production, use Let's Encrypt or a commercial certificate."
