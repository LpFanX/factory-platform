#!/usr/bin/env bash
# Автономный тик фабрики. Если автопилот включён в настройках платформы —
# factory_tick.py берёт следующую одобренную идею, прогоняет с учётом стоимости
# и предохранителей (кап/max_tokens) и пишет результат в SQLite (стадии/цена/текст).
# Если автопилот выключен — тик сам делает no-op (безопасно).
set -uo pipefail
FDIR=/home/ubuntu/factory
CLONE=/home/ubuntu/content-agents
DATA=/home/ubuntu/factory-data
LOG="$FDIR/factory.log"
PY="$FDIR/.venv/bin/python"

echo "=== $(date -Is) tick ===" >>"$LOG"
CONTENT_AGENTS_DATA="$DATA" ENGINE_DIR="$CLONE" PYTHONPATH="$FDIR:$CLONE" \
    "$PY" "$FDIR/server/factory_tick.py" >>"$LOG" 2>&1
rc=$?
echo "=== tick done (rc=$rc) ===" >>"$LOG"
