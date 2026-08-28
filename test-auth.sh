#!/bin/bash

echo "Testing kiro.router.plus Basic Authentication"
echo "=============================================="
echo

echo "1. Testing WITHOUT credentials (should fail with 401):"
response=$(wget --spider --server-response https://kiro.router.plus 2>&1 | grep "HTTP/")
echo "$response"
echo

echo "2. Testing WITH correct credentials (should succeed with 302):"
response=$(wget --spider --server-response --user=admin --password='El2bfDMU' https://kiro.router.plus 2>&1 | grep "HTTP/")
echo "$response"
echo

echo "3. Testing WITH wrong credentials (should fail with 401):"
response=$(wget --spider --server-response --user=admin --password='wrongpassword' https://kiro.router.plus 2>&1 | grep "HTTP/")
echo "$response"
echo

echo "Done!"
