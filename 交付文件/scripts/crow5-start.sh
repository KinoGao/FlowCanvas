#!/bin/sh
set -e

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
if [ ! -d "$ROOT_DIR/web/node_modules" ]; then
  echo "[Crow5] 未发现依赖，先执行: bun install"
  (cd "$ROOT_DIR/web" && bun install) || exit 1
fi

cd "$ROOT_DIR/web"
echo "[Crow5] 启动项目：bun run dev"
exec bun run dev
