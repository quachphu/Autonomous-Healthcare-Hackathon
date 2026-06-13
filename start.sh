#!/bin/bash
# Materna — start backend + frontend cleanly
set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
VENV="$ROOT/backend/.venv/bin"

echo "→ Killing any process on port 8000..."
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
sleep 1

echo "→ Starting backend (port 8000)..."
cd "$BACKEND"
"$VENV/uvicorn" app.main:app --reload --port 8000 &
BACKEND_PID=$!

echo "→ Waiting for backend to be ready..."
for i in $(seq 1 15); do
  if curl -s -o /dev/null http://localhost:8000/api/health 2>/dev/null; then
    echo "  Backend ready ✓"
    break
  fi
  sleep 1
done

echo "→ Starting frontend (port 5173)..."
cd "$FRONTEND"
npm run dev

# When frontend exits, also kill backend
kill $BACKEND_PID 2>/dev/null || true
