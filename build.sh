#!/bin/bash
set -e

echo "=== Clearing old dependencies ==="
rm -rf node_modules apps/*/node_modules packages/*/node_modules

echo "=== Installing all dependencies (including dev) ==="
npm install --include=dev

echo "=== Verifying @types/react-dom ==="
ls -la node_modules/@types/react-dom 2>/dev/null || echo "WARNING: @types/react-dom not found!"

echo "=== Building shared package ==="
cd packages/shared && npm run build && cd ../..

echo "=== Building web app ==="
cd apps/web && npm run build && cd ../..

echo "=== Building server ==="
cd apps/server && npm run build && cd ../..

echo "=== Copying web dist to server ==="
mkdir -p apps/server/dist/web
cp -r apps/web/dist/* apps/server/dist/web/

echo "=== Build complete ==="
