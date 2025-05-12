#!/bin/bash
# Generate self-signed certificate for HTTPS

# Create the certs directory if it doesn't exist
mkdir -p certs
cd certs

# Generate private key
openssl genrsa -out key.pem 2048

# Generate certificate signing request (CSR)
# Common Name should be set to your IP address
openssl req -new -key key.pem -out cert.csr -subj "/C=JP/ST=Tokyo/L=Tokyo/O=Development/CN=10.88.135.247"

# Add Subject Alternative Names (SANs) for localhost, 127.0.0.1, and your public IP
echo "subjectAltName=DNS:localhost,DNS:10.88.135.247,IP:127.0.0.1,IP:10.88.135.247" > openssl.ext

# Generate self-signed certificate
openssl x509 -req -days 365 -in cert.csr -signkey key.pem -out cert.pem -extfile openssl.ext

echo "Self-signed SSL certificate generated successfully in the certs directory"
