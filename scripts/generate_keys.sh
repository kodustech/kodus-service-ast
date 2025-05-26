#!/bin/bash
if [ ! -d "../certs" ]; then
    mkdir ../certs
fi
cd ../certs

# Generate CA key and certificate
openssl genrsa -out ca.key 4096
openssl req -new -x509 -days 3650 -key ca.key -out ca.crt -subj "/CN=Root CA"
# The CA key is used to sign the server and client certificates

# Generate server key and certificate
openssl genrsa -out server.key 4096
openssl req -new -key server.key -out server.csr
openssl x509 -req -days 365 -in server.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -subj "/CN=kodus-service-ast"
# The server key is used to encrypt the data sent to the client

# Generate client key and certificate
openssl genrsa -out client.key 4096
openssl req -new -key client.key -out client.csr
openssl x509 -req -days 365 -in client.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out client.crt -subj "/CN=kodus-orchestrator"
# The client key is used to decrypt the data sent from the server