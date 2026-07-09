#!/usr/bin/env bash
# Клон/автообновление движка content-agents (запускается factory-update.timer).
#
# Первый запуск: клонирует ENGINE_REPO в CLONE (нужен доступ к приватному репо —
# deploy key / ssh-ключ пользователя, под которым работает юнит).
# Дальше: git pull --ff-only + валидация workflow'ов. Клон считается read-only:
# перед pull откатываем queue.yaml (движок может дефолтно писать его в клон —
# данные должны жить в CONTENT_AGENTS_DATA, см. README).
set -uo pipefail
CLONE="${ENGINE_DIR:-/home/ubuntu/content-agents}"
ENGINE_REPO="${ENGINE_REPO:-git@github.com:levashove/content-agents.git}"
VENV="${FACTORY_VENV:-/home/ubuntu/factory/.venv}"
LOG="${UPDATE_LOG:-/home/ubuntu/factory/update.log}"

echo "=== $(date -Is) update start ===" >>"$LOG"

if [ ! -d "$CLONE/.git" ]; then
  echo "клона нет — clone $ENGINE_REPO -> $CLONE" >>"$LOG"
  git clone "$ENGINE_REPO" "$CLONE" >>"$LOG" 2>&1 || { echo "clone failed" >>"$LOG"; exit 1; }
fi

cd "$CLONE" || exit 1
before=$(git rev-parse --short HEAD 2>/dev/null)
# guard: очередь идей трекается движком в git — правки дербанят клон и ломают ff-pull
git checkout -- library/idea-bank/queue.yaml 2>/dev/null || true
git pull --ff-only >>"$LOG" 2>&1 || { echo "pull failed (non-ff/conflict) — оставляю как есть" >>"$LOG"; exit 0; }
after=$(git rev-parse --short HEAD 2>/dev/null)

if [ "$before" != "$after" ]; then
  echo "engine updated: $before -> $after; validating workflows" >>"$LOG"
  "$VENV/bin/python" "$CLONE/scripts/validate_workflows.py" >>"$LOG" 2>&1 \
    && echo "validate OK" >>"$LOG" || echo "validate FAILED — проверить лог" >>"$LOG"
else
  echo "no change ($after)" >>"$LOG"
fi
echo "=== done ===" >>"$LOG"
