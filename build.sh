#!/bin/bash
set -e

echo "=== Installing dependencies ==="
npm install

echo "=== Building shared package ==="
npm run build --workspace=@yuyou/shared

echo "=== Building web app ==="
npm run build --workspace=@yuyou/web

echo "=== Building server ==="
npm run build --workspace=@yuyou/server

echo "=== Copying web dist to server ==="
mkdir -p apps/server/dist/web
cp -r apps/web/dist/* apps/server/dist/web/

echo "=== Build complete ==="
