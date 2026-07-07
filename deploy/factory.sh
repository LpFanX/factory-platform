#!/usr/bin/env bash
# Автономный тик фабрики: если автопилот включён в настройках — берёт следующую
# одобренную идею и прогоняет её через factory_run.py. Иначе — no-op (безопасно).
set -uo pipefail
FDIR=/home/ubuntu/factory
CLONE=/home/ubuntu/content-agents
DATA=/home/ubuntu/factory-data
LOG="$FDIR/factory.log"
SETTINGS="$DATA/platform/settings.json"
PY="$FDIR/.venv/bin/python"

get() { "$PY" -c "import json,sys;print(json.load(open('$SETTINGS')).get('$1', $2))" 2>/dev/null || echo "$3"; }

ap=$(get autopilot_enabled False False)
be=$(get backend "'echo'" echo)
pr=$(get profile "'standard'" standard)

echo "=== $(date -Is) tick · autopilot=$ap backend=$be profile=$pr ===" >>"$LOG"
if [ "$ap" != "True" ]; then echo "autopilot выключен — пропуск" >>"$LOG"; exit 0; fi

cd "$CLONE" || exit 1
CONTENT_AGENTS_DATA="$DATA" PYTHONPATH="$CLONE" "$PY" scripts/factory_run.py \
    --queue "$DATA/library/idea-bank/queue.yaml" \
    --profile "$pr" --backend "$be" --max 1 >>"$LOG" 2>&1
echo "=== tick done ===" >>"$LOG"
