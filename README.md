# Content Factory — платформа

Тонкая платформа-обёртка над движком агентов `content-agents`. Движок берётся из git
(read-only клон, обновляется отдельно), платформа и данные — на нашей стороне.

## Слои

- **Движок** (`ENGINE_DIR`, дефолт `/home/ubuntu/content-agents`) — read-only клон, `git pull` ночью.
- **Данные** (`CONTENT_AGENTS_DATA`, дефолт `/home/ubuntu/factory-data`) — `library/`, банк идей, прогоны.
- **Платформа** (этот репозиторий, дефолт `/home/ubuntu/factory`):
  - `server/app.py` — FastAPI: `/api/engine`, `/api/ideas`, `/api/runs`, `/api/workflows/{id}`, WebSocket `/api/runs/ws` (стримит стадии прогона), отдаёт `web/index.html`.
  - `web/index.html` — светлый tech-дашборд: живой конвейер агентов с анимацией, лог+метрики по клику на агента, банк идей, история.
  - `deploy/` — `factory-web.service` (systemd, uvicorn на `127.0.0.1:8020`) + `nginx-factory.conf` (`factory.lpfanx.ru` → :8020, с WebSocket).

Платформа НЕ импортирует движок в процесс — дёргает его CLI (`codex_runner`) подпроцессом
и парсит пошаговый прогресс. Так обновление движка не ломает платформу.

## Запуск локально (для разработки)

```bash
python -m venv .venv && .venv/bin/pip install -r server/requirements.txt
ENGINE_DIR=/path/to/content-agents CONTENT_AGENTS_DATA=/path/to/data \
  .venv/bin/uvicorn server.app:app --port 8020 --reload
```

## Деплой (VM)

```bash
rsync -az server web deploy ubuntu@lpfanx.ru:/home/ubuntu/factory/
/home/ubuntu/factory/.venv/bin/pip install -r /home/ubuntu/factory/server/requirements.txt
sudo cp /home/ubuntu/factory/deploy/factory-web.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now factory-web
sudo cp /home/ubuntu/factory/deploy/nginx-factory.conf /etc/nginx/sites-available/factory
sudo nginx -t && sudo systemctl reload nginx
```

## Переключение на реальный шлюз (ProxyAPI)

В `factory-web.service` (или `/home/ubuntu/factory/.env`):
`LLM_BACKEND=openai`, `LLM_BASE_URL=https://api.proxyapi.ru/openai/v1`, `OPENAI_API_KEY=…` → `systemctl restart factory-web`.
По умолчанию `LLM_BACKEND=echo` (офлайн-демо, без ключа).
