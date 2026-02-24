#!/bin/bash
set -e

# --- Help ---
show_help() {
    cat << 'EOF'
Usage: crt_wildcard_ssl.sh [DOMAIN]

Generate a self-signed wildcard SSL certificate for a given domain.

Creates a local CA (if not already present) and signs a wildcard certificate
for *.DOMAIN and DOMAIN.

Arguments:
  DOMAIN    The base domain (e.g. micstec.com). If omitted, you will be
            prompted to enter it interactively.

Options:
  --help    Show this help message and exit.

Examples:
  ./crt_wildcard_ssl.sh micstec.com
  ./crt_wildcard_ssl.sh example.org
  ./crt_wildcard_ssl.sh              # will prompt for domain

Output files (in ./certs/<domain>/):
  ca.key          - CA private key
  ca.crt          - CA certificate (import this into your OS trust store)
  <domain>.key    - Server private key
  <domain>.crt    - Server certificate (use in nginx/apache)
  <domain>.csr    - Certificate signing request (intermediate artifact)
EOF
    exit 0
}

# --- Parse args ---
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    show_help
fi

DOMAIN="$1"

if [[ -z "$DOMAIN" ]]; then
    read -rp "Enter the base domain (e.g. micstec.com): " DOMAIN
fi

if [[ -z "$DOMAIN" ]]; then
    echo "Error: Domain cannot be empty."
    exit 1
fi

# Strip any leading wildcard or dots the user might have typed
DOMAIN="${DOMAIN#\*.}"
DOMAIN="${DOMAIN#.}"

echo ""
echo "==> Generating wildcard SSL certificate for *.${DOMAIN}"
echo ""

# --- Setup output directory ---
CERT_DIR="./certs/${DOMAIN}"
mkdir -p "$CERT_DIR"

# --- Step 1: Create CA (reuse if already exists) ---
if [[ -f "$CERT_DIR/ca.key" && -f "$CERT_DIR/ca.crt" ]]; then
    echo "[CA] Reusing existing CA in $CERT_DIR/"
else
    echo "[CA] Generating CA private key..."
    openssl genrsa -out "$CERT_DIR/ca.key" 2048 2>/dev/null

    echo "[CA] Generating CA certificate (valid 10 years)..."
    openssl req -x509 -new -nodes \
        -key "$CERT_DIR/ca.key" \
        -sha256 -days 3650 \
        -out "$CERT_DIR/ca.crt" \
        -subj "/CN=${DOMAIN} Local CA"
fi

# --- Step 2: Generate server key and CSR ---
echo "[SSL] Generating server private key..."
openssl genrsa -out "$CERT_DIR/${DOMAIN}.key" 2048 2>/dev/null

echo "[SSL] Generating certificate signing request..."
openssl req -new \
    -key "$CERT_DIR/${DOMAIN}.key" \
    -out "$CERT_DIR/${DOMAIN}.csr" \
    -subj "/CN=*.${DOMAIN}"

# --- Step 3: Create SAN extension config ---
cat > "$CERT_DIR/san.ext" << EOF
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
subjectAltName=@alt_names

[alt_names]
DNS.1 = *.${DOMAIN}
DNS.2 = ${DOMAIN}
EOF

# --- Step 4: Sign the certificate ---
echo "[SSL] Signing certificate with CA (valid 825 days)..."
openssl x509 -req \
    -in "$CERT_DIR/${DOMAIN}.csr" \
    -CA "$CERT_DIR/ca.crt" \
    -CAkey "$CERT_DIR/ca.key" \
    -CAcreateserial \
    -out "$CERT_DIR/${DOMAIN}.crt" \
    -days 825 -sha256 \
    -extfile "$CERT_DIR/san.ext" 2>/dev/null

# Cleanup intermediate files
rm -f "$CERT_DIR/san.ext" "$CERT_DIR/ca.srl"

echo ""
echo "==> Done! Files created in: $CERT_DIR/"
echo ""
ls -la "$CERT_DIR/"

# --- Print user guide ---
FULL_CERT_DIR="$(cd "$CERT_DIR" && pwd)"
WSL_DISTRO="${WSL_DISTRO_NAME:-Ubuntu}"

cat << EOF

================================================================================
  SETUP GUIDE
================================================================================

1. NGINX CONFIGURATION
   Add or update your nginx server block:

   server {
       listen 443 ssl;
       server_name *.${DOMAIN} ${DOMAIN};

       ssl_certificate     ${FULL_CERT_DIR}/${DOMAIN}.crt;
       ssl_certificate_key ${FULL_CERT_DIR}/${DOMAIN}.key;

       # ... your other config ...
   }

   Then reload nginx:
     sudo nginx -t && sudo nginx -s reload

--------------------------------------------------------------------------------

2. IMPORT CA INTO WINDOWS (so Chrome trusts your cert)

   The CA certificate is at:
     \\\\wsl\$\\${WSL_DISTRO}${FULL_CERT_DIR}/ca.crt

   Steps (NO admin required):
     a. Open File Explorer and navigate to the path above
     b. Double-click ca.crt
     c. Click "Install Certificate..."
     d. Select "Current User" → Next
     e. Select "Place all certificates in the following store"
     f. Click Browse → choose "Trusted Root Certification Authorities" → OK
     g. Click Next → Finish
     h. Restart Chrome

   Or via PowerShell (Current User, no admin):
     certutil -user -addstore "ROOT" "\\\\wsl\$\\${WSL_DISTRO}${FULL_CERT_DIR}/ca.crt"

--------------------------------------------------------------------------------

3. CHROME HOST MAPPING (if pointing domain to localhost)

   Close all Chrome windows first:
     taskkill /F /IM chrome.exe

   Then launch with:
     "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --host-resolver-rules="MAP *.${DOMAIN} 127.0.0.1"

   Verify at: chrome://net-internals/#dns

================================================================================
EOF
