#!/bin/bash
set -euo pipefail

echo "=== Starting Temporal Agent Development ==="

# Ensure .env exists
if [ ! -f .env ]; then
  echo "Creating .env from .env.example..."
  cp .env.example .env
  echo "WARNING: Please edit .env with your LLM_API_KEY before proceeding."
  echo ""
fi

# Start Temporal server
echo "Starting Temporal server..."
docker compose up -d

echo "Waiting for Temporal to be ready..."
max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
  if docker compose exec -T temporal temporal operator cluster health 2>/dev/null; then
    echo "Temporal is ready!"
    break
  fi
  attempt=$((attempt + 1))
  echo "  Waiting... ($attempt/$max_attempts)"
  sleep 5
done

if [ $attempt -eq $max_attempts ]; then
  echo "WARNING: Temporal may not be fully ready. Check with: docker compose logs temporal"
fi

echo ""
echo "Starting worker and API server..."
echo "  Worker: npm run dev:worker"
echo "  API:    npm run dev:api"
echo ""
echo "Temporal Web UI: http://localhost:8080"
echo "API Health:      http://localhost:3000/health"
echo ""
echo "Press Ctrl+C to stop everything."

# Trap exit to stop docker
cleanup() {
  echo ""
  echo "Stopping Temporal server..."
  docker compose down
  echo "Stopped."
}
trap cleanup EXIT

# Start worker and API in parallel
npx concurrently --kill-others \
  "npm run dev:worker" \
  "npm run dev:api"
