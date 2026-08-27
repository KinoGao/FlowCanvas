#!/usr/bin/env bash
# FlowCanvas WSL 一键启动：后端(9801) + 前端(9800)
# 用法：./scripts/dev.sh
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT/.codex-runtime"
mkdir -p "$LOG_DIR"

# JDK：后端需要完整 JDK（系统 java 只是 JRE，缺 javac/ct.sym）
export JAVA_HOME="${JAVA_HOME:-/home/gn/jdk21-full}"
if [ ! -x "$JAVA_HOME/bin/javac" ]; then
    echo "[dev] ERROR: $JAVA_HOME 不是完整 JDK（找不到 javac）" >&2
    exit 1
fi
export PATH="$JAVA_HOME/bin:$PATH"

# 数据库：默认放 WSL 原生文件系统（/mnt/* 上 SQLite WAL 共享内存不可靠）
export DB_PATH="${DB_PATH:-/home/gn/flowcanvas-data/app.db}"
mkdir -p "$(dirname "$DB_PATH")"

WEB_PORT="${WEB_PORT:-9800}"
BACKEND_PORT="${PORT:-9801}"

already() { curl -s -o /dev/null --max-time 2 "$1"; }

# 后端
if already "http://127.0.0.1:${BACKEND_PORT}/api/health"; then
    echo "[dev] 后端已在运行 (:$BACKEND_PORT)"
else
    echo "[dev] 启动后端 (:$BACKEND_PORT) ..."
    (cd "$ROOT/backend" && nohup mvn spring-boot:run > "$LOG_DIR/backend.log" 2>&1 & disown)
fi

# 前端
if already "http://127.0.0.1:${WEB_PORT}/"; then
    echo "[dev] 前端已在运行 (:$WEB_PORT)"
else
    echo "[dev] 启动前端 (:$WEB_PORT) ..."
    (cd "$ROOT/web" && nohup npx vite --host 0.0.0.0 --port "$WEB_PORT" > "$LOG_DIR/web.log" 2>&1 & disown)
fi

# 等待就绪
echo "[dev] 等待服务就绪 ..."
for _ in $(seq 1 60); do
    back=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:${BACKEND_PORT}/api/health" || true)
    front=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://127.0.0.1:${WEB_PORT}/" || true)
    if [ "$back" != "000" ] && [ "$front" != "000" ]; then
        echo "[dev] OK  前端 http://localhost:${WEB_PORT}  后端 http://localhost:${BACKEND_PORT} (health $back)"
        exit 0
    fi
    sleep 3
done
echo "[dev] 启动超时，查看日志：$LOG_DIR/backend.log / $LOG_DIR/web.log" >&2
exit 1
