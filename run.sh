#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_PID=""
FRONTEND_PID=""

cleanup() {
  [[ -z "$FRONTEND_PID" ]] || kill "$FRONTEND_PID" 2>/dev/null || true
  [[ -z "$BACKEND_PID" ]] || kill "$BACKEND_PID" 2>/dev/null || true
  [[ -z "$FRONTEND_PID" ]] || wait "$FRONTEND_PID" 2>/dev/null || true
  [[ -z "$BACKEND_PID" ]] || wait "$BACKEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

command -v uv >/dev/null || { echo "Install uv first: https://docs.astral.sh/uv/" >&2; exit 1; }
command -v npm >/dev/null || { echo "Install Node.js/npm first." >&2; exit 1; }
command -v curl >/dev/null || { echo "Install curl first." >&2; exit 1; }

if [[ ! -f "$ROOT/backend/.env" ]]; then
  cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
  echo "Created backend/.env; add your AI key there to enable AI features."
fi

cd "$ROOT/backend"
uv sync
uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then
  npm install
fi
npm run dev -- --hostname 127.0.0.1 --port 3000 &
FRONTEND_PID=$!

wait_for_url() {
  local url="$1"
  for _ in {1..60}; do
    if curl --silent --fail "$url" >/dev/null; then
      return 0
    fi
    sleep 1
  done
  echo "Service did not become ready: $url" >&2
  return 1
}

wait_for_url http://127.0.0.1:8000/api/health
wait_for_url http://127.0.0.1:3000
echo "AI News is ready at http://127.0.0.1:3000 (Ctrl+C to stop)."
if command -v xdg-open >/dev/null; then
  xdg-open http://127.0.0.1:3000 >/dev/null 2>&1 || true
fi
wait "$BACKEND_PID"
