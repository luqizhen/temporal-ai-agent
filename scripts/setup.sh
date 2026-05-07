#!/bin/bash
set -euo pipefail

echo "=== Temporal Agent Setup ==="

if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "Please edit .env with your LLM API key and other settings."
  echo ""
fi

if ! command -v node &> /dev/null; then
  echo "Error: Node.js is not installed. Please install Node.js 20+."
  exit 1
fi

echo "Installing dependencies..."
npm ci

echo "Building project..."
npm run build

echo ""
echo "=== Setup complete ==="
echo ""
echo "To start development:"
echo "  1. Start Temporal:  docker compose up -d"
echo "  2. Start worker:    npm run dev:worker"
echo "  3. Start API:       npm run dev:api"
echo ""
echo "Or use the dev script:"
echo "  ./scripts/start-dev.sh"
