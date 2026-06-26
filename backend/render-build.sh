#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

python -m pip install --upgrade pip
python -m pip install -r requirements.txt

if [ -f ../frontend/package-lock.json ] && command -v npm >/dev/null 2>&1; then
  cd ../frontend
  npm ci
  npm run build
else
  echo "npm nao encontrado ou package-lock ausente; frontend nao sera compilado." >&2
fi
