# Content Factory — платформа

Автономная «фабрика контента»: конвейер LLM-агентов пишет статьи (SEO и другие форматы),
человек подтверждает результат в веб-панели. Платформа — тонкая обёртка над движком агентов
[`content-agents`](https://github.com/levashove/content-agents) (приватный репозиторий):
движок берётся из git **read-only клоном и автообновляется**, вся логика платформы,
данные и деньги — на нашей стороне.

```
 идея → [researcher] → [writer] → [editor] → [fact-checker] → [final-trust-editor] → статья
          sonar          sonnet     sonnet       sonar             opus                 ↓
        (Perplexity,   (Claude)   (Claude)    (Perplexity)      (Claude)          ревью человеком
         нативный                                                                 в веб-панели
         поиск)                                                                   → Strapi (план)
```

Каждая стадия — отдельный вызов LLM через **AITunnel** (OpenAI-совместимый шлюз: Claude,
GPT, Gemini, Perplexity одним ключом; `usage` отдаёт `cost_rub` и `balance` — себестоимость
считается точно, по данным шлюза).

## Три слоя (три каталога)

| Слой | Путь (дефолт) | Что это |
|------|---------------|---------|
| **Движок** | `ENGINE_DIR` = `/home/ubuntu/content-agents` | read-only git-клон `content-agents`; обновляется таймером (`git pull --ff-only` + валидация). Никогда не редактируется на месте |
| **Данные** | `CONTENT_AGENTS_DATA` = `/home/ubuntu/factory-data` | библиотека статей, банк идей (`library/idea-bank/queue.yaml`), SQLite платформы (`platform/factory.db`), настройки (`platform/settings.json`) |
| **Платформа** | `/home/ubuntu/factory` (этот репозиторий) | FastAPI-бэкенд + собранный React SPA + systemd/nginx конфиги |

Платформа **не импортирует движок в свой процесс** — дёргает его подпроцессом
(`server/run_agent.py` → `backend.codex_runner`) и стримит прогресс. Обновление движка
не требует перезапуска платформы; клон остаётся git-чистым (данные пишутся только в
`CONTENT_AGENTS_DATA`).

## Структура репозитория

```
server/
  app.py          # FastAPI: REST + WebSocket + отдача SPA; опц. авторизация (cookie-сессии)
  store.py        # SQLite (runs, activity) + settings.json
  run_agent.py    # раннер прогона: учёт cost_rub/balance, ЖЁСТКИЙ кап стоимости (preflight
                  # + постфактум), снятие tools для sonar-* (Perplexity не умеет function tools)
  factory_tick.py # автономный тик: одобренная идея → прогон → SQLite → идея done
frontend/         # исходники SPA: React + TS + Vite + Tailwind + React Flow + Framer Motion
web/              # собранный SPA (vite build → rsync), отдаётся nginx'ом
deploy/
  factory-web.service        # uvicorn на 127.0.0.1:8020 (EnvironmentFile=.env)
  factory-scheduler.service  # + .timer (кажд. 30 мин): автономный тик (no-op, если автопилот off)
  factory-update.sh          # клон/автообновление движка: git clone (первый раз) + git pull
                             # --ff-only + guard queue.yaml + валидация workflow'ов
  factory-update.service     # + .timer (ночью 04:30): запуск factory-update.sh
  factory.sh                 # обёртка тика (вызывается таймером)
  factory-auth.sh            # тумблер авторизации панели: on|off
  nginx-factory.conf         # TLS, /api → :8020 (+WebSocket), SPA fallback (try_files)
```

Панель (вкладки = URL): `/` дашборд с живым конвейером · `/runs` история со стадиями и
ценой · `/budget` баланс/расходы/алерт · `/approvals` ревью черновиков с предпросмотром ·
`/settings` настройки + таймеры · `/logs` журналы.

## Как происходит генерация

- **Вручную:** кнопка в панели → WebSocket `/api/runs/ws` → `run_agent.py` подпроцессом →
  стадии анимируются живьём, результат в SQLite (`status=awaiting_review`).
- **Автономно:** systemd-таймер каждые 30 мин → `factory_tick.py`: если в настройках включён
  автопилот — берёт следующую **одобренную** идею из банка, прогоняет, кладёт в SQLite,
  помечает идею `done`. Автопилот выключен — тик no-op (безопасно).
- **Ревью:** черновик появляется в «Согласованиях» (полный текст, markdown) → «принять» /
  «доработать». Принятые — кандидаты на публикацию (Strapi — см. Roadmap).

## Контроль стоимости (важно: ключ платный)

- `max_cost_per_run_rub` (настройки, дефолт 30 ₽) — **жёсткий кап прогона**: preflight-оценка
  до вызова (символы × тариф модели) + пост-фактум учёт; превышение → RunAbort, стоимость
  печатается всегда (даже при падении).
- `max_tokens` на вызов, лимит tool-итераций, промпт-кэш AITunnel (`session_id` +
  `cache_control` через `extra_body`).
- **Пер-ролевые модели** (движок ≥ 4.57): env `PROMPT_CONTENTS_ROLE_MODELS` — дешёвый
  Perplexity `sonar` на поиск/фактчек, Claude на текст, Opus только на финал.
  Ориентир себестоимости: **150–250 ₽/статья** (замер 2026-07-09).
- Backend по умолчанию — `echo` (офлайн-стаб, 0 ₽): переключение на реальный шлюз —
  осознанное действие в настройках.

## Переменные окружения (`.env` рядом с юнитами; в k8s — Secret/ConfigMap)

| Переменная | Что делает |
|------------|------------|
| `OPENAI_API_KEY` | ключ AITunnel (секрет!) |
| `LLM_BASE_URL` | `https://api.aitunnel.ru/v1` |
| `ENGINE_DIR`, `CONTENT_AGENTS_DATA` | пути слоёв (см. выше) |
| `PROMPT_CONTENTS_ROLE_MODELS` | JSON: роль/слаг агента → тир или id модели. Наша схема: `{"researcher":"sonar","fact-checker":"sonar","writer":"sonnet","editor":"sonnet","final-trust-editor":"opus","seo-semantics-analyst":"gpt-4o-mini"}` |
| `PROMPT_CONTENTS_TIER_MODELS` | JSON: тир → id по провайдерам, напр. `{"openai":{"haiku":"claude-haiku-4.5","sonnet":"claude-sonnet-4.6","opus":"claude-opus-4.8"}}` (id в нотации AITunnel) |
| `PROMPT_CONTENTS_STAGE_INPUT_BUDGET` | JSON: кап входа стадии в символах по input-ключам, напр. `{"research_brief":24000,"default":40000}` |
| `PLATFORM_PASSWORD` | если задан — панель и API закрыты паролем (cookie-сессия HMAC, 30 дней; login/logout встроены в SPA). Закомментирован = авторизация выключена. Тумблер: `deploy/factory-auth.sh on\|off` |
| `PLATFORM_SECRET` | ключ подписи сессий (hex) |

⚠️ JSON-значения — одной строкой без пробелов. systemd `EnvironmentFile` читает их корректно;
**не** сорсить `.env` вручную в bash (`{...}` разворачивается brace expansion и ломает JSON).

## HTTP API (точки интеграции)

| Метод | Путь | Что |
|-------|------|-----|
| GET | `/api/health` | ok + включена ли авторизация (всегда открыт) |
| GET | `/api/engine` | версия/sha движка, время последнего pull |
| GET/POST | `/api/ideas`, `/api/ideas/{id}/approve\|reject` | банк идей |
| GET | `/api/runs`, `/api/runs/{id}` | прогоны: статус, стадии, токены, cost, balance |
| GET | `/api/runs/{id}/content` | **готовый текст статьи (markdown)** |
| POST | `/api/runs/{id}/review` | `{"decision":"accept"\|"rework"}` |
| GET/POST | `/api/settings` | настройки платформы (кап, автопилот, ревью, шлюз) |
| GET | `/api/aitunnel/balance`, `/api/aitunnel/stats` | баланс и расход по ключу |
| WS | `/api/runs/ws` | ручной прогон со стримом стадий |

Жизненный цикл статьи: `awaiting_review` → (человек) → `accepted` | `reworked`.
**Для интеграции с сайтом:** забирать `accepted` + `content` (pull), либо после accept
пушить в publish-API CMS (в движке ≥ 4.53 уже есть read-адаптер Strapi:
`backend/cms/strapi.py`, env `STRAPI_API_TOKEN`).

## Деплой сейчас (VM, systemd + nginx)

```bash
rsync -az server/ web/ ubuntu@HOST:/home/ubuntu/factory/{server,web}/
cp deploy/factory-update.sh /home/ubuntu/factory/update.sh && chmod +x /home/ubuntu/factory/update.sh
cp deploy/factory.sh /home/ubuntu/factory/factory.sh && chmod +x /home/ubuntu/factory/factory.sh
sudo cp deploy/factory-{web,scheduler,update}.service deploy/factory-{scheduler,update}.timer /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now factory-web factory-scheduler.timer factory-update.timer
sudo cp deploy/nginx-factory.conf /etc/nginx/sites-available/factory && sudo nginx -t && sudo systemctl reload nginx
```

Первичный клон движка сделает `update.sh` сам (env `ENGINE_REPO`, дефолт —
`git@github.com:levashove/content-agents.git`; репозиторий приватный — нужен deploy key
или ssh-ключ с доступом).

Зависимости бэкенда: python3.12 + venv, `pip install -r server/requirements.txt`.
Движку достаточно PyYAML (чистый Python 3.10+).

## Перенос в Kubernetes (заметки для SRE)

- **Контейнер один**: uvicorn (`server.app:app`) + статика `web/` (можно отдавать самим
  uvicorn'ом или sidecar-nginx). Всё CPU-bound лёгкое: 0.5–1 vCPU / 512Mi хватает.
- **PVC** под `CONTENT_AGENTS_DATA` (SQLite + библиотека; десятки МБ).
- **Клон движка**: init-container / git-sync sidecar с `github.com/levashove/content-agents`
  (приватный — нужен deploy key или токен). Сейчас на VM это таймер с `git pull --ff-only`.
- **Egress**: `api.aitunnel.ru:443` (LLM), `github.com:443` (обновление движка;
  `raw.githubusercontent.com` — сверка с докой продукта). **Ingress**: панель внутри контура.
- **Secret**: `OPENAI_API_KEY` (+ `STRAPI_API_TOKEN`, когда дойдём до публикации).
- **CronJob** вместо systemd-таймеров: автономный тик (`server/factory_tick.py`) и обновление клона.
- Авторизацию панели внутри контура можно не включать (`PLATFORM_PASSWORD` не задавать).

## Локальная разработка

```bash
# бэкенд
python -m venv .venv && .venv/bin/pip install -r server/requirements.txt
ENGINE_DIR=/path/to/content-agents CONTENT_AGENTS_DATA=/tmp/factory-data \
  .venv/bin/uvicorn server.app:app --port 8020 --reload
# фронтенд (dev-сервер проксирует /api на :8020)
cd frontend && npm i && npm run dev
# сборка SPA в web/
npm run build && rsync -a --delete dist/ ../web/
```

## Roadmap

- **Публикация в Strapi** после accept (read-адаптер уже в движке; write-путь + доступ из
  контура — в работе).
- **VK Workspace бот**: уведомления о черновиках + принять/доработать из мессенджера.
- Идеи/бэклог — в issues.
