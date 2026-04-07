#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker Desktop is required. Install Docker Desktop for Mac, then run this launcher again."
  read -r -p "Press Enter to close..."
  exit 1
fi

APP_PORT=6789
ISAIBOX_CACHE_LIMIT_GB=20
if [ -f .env ]; then
  set -a
  source ./.env
  set +a
fi

bash ./run-local.sh
open "http://127.0.0.1:${APP_PORT}/"
echo "isaibox local is running on http://127.0.0.1:${APP_PORT}/"
echo "Cache limit: ${ISAIBOX_CACHE_LIMIT_GB} GB"
read -r -p "Press Enter to close..."
