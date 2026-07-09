#!/usr/bin/env bash
# Тумблер авторизации дашборда: авторизация включена, когда PLATFORM_PASSWORD
# задан в .env (см. server/app.py: AUTH_ON). off = закомментировать строку,
# on = раскомментировать. Пароль при этом не теряется.
#   ./factory-auth.sh off   — открыть панель (внутренний контур/кубер)
#   ./factory-auth.sh on    — закрыть панель паролем обратно
set -euo pipefail
ENV=/home/ubuntu/factory/.env

case "${1:-}" in
  off) sudo sed -i 's/^PLATFORM_PASSWORD=/#PLATFORM_PASSWORD=/' "$ENV" ;;
  on)  sudo sed -i 's/^#PLATFORM_PASSWORD=/PLATFORM_PASSWORD=/' "$ENV" ;;
  *)   echo "usage: $0 on|off"; exit 1 ;;
esac

sudo systemctl restart factory-web
sleep 2
echo -n "health: "; curl -s localhost:8020/api/health; echo
