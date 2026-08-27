#!/usr/bin/env bash
# FlowCanvas 停止开发服务
set -u
pkill -f "spring-boot:run" 2>/dev/null && echo "[dev] 后端已停止" || echo "[dev] 后端未在运行"
pkill -f "vite --host 0.0.0.0 --port 9800" 2>/dev/null && echo "[dev] 前端已停止" || echo "[dev] 前端未在运行"
# mvn 派生的 java 进程
pkill -f "infinitecanvas" 2>/dev/null || true
exit 0
