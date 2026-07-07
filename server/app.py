"""Content Factory — платформа (обёртка над движком content-agents).

Движок берётся из ENGINE_DIR (read-only клон, обновляется отдельно с git),
данные — из CONTENT_AGENTS_DATA. Мы НЕ импортируем движок в процесс, а
дёргаем его CLI (codex_runner) подпроцессом и стримим прогресс по WebSocket —
так платформа не ломается при рефакторингах движка.
"""
import os
import re
import json
import time
import uuid
import asyncio
import pathlib
import subprocess

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

FACTORY = pathlib.Path(__file__).resolve().parent.parent          # /home/ubuntu/factory
ENGINE = pathlib.Path(os.environ.get("ENGINE_DIR", "/home/ubuntu/content-agents"))
DATA = pathlib.Path(os.environ.get("CONTENT_AGENTS_DATA", "/home/ubuntu/factory-data"))
PYBIN = os.environ.get("PYBIN", str(FACTORY / ".venv" / "bin" / "python"))
LLM_BACKEND = os.environ.get("LLM_BACKEND", "echo")               # 'echo' сейчас; 'openai' + base_url позже
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")
RUN_PROFILE = os.environ.get("RUN_PROFILE", "standard")
WEB = FACTORY / "web"

# Стадии SEO-конвейера (для начальной раскладки графа; факт приходит событиями).
SEO_STAGES = ["seo-researcher", "seo-writer", "content-editor", "seo-fact-checker", "final-trust-editor"]
STAGE_RU = {
    "seo-researcher": "Исследователь",
    "seo-writer": "Автор",
    "content-editor": "Редактор",
    "seo-fact-checker": "Факт-чек",
    "final-trust-editor": "Финал",
}
LINE_RE = re.compile(r"\[(\w+)\]\s*([A-Za-z0-9_\-]+)\s*:?\s*(.*)")

app = FastAPI(title="Content Factory Platform")


def _git(*args):
    try:
        return subprocess.check_output(["git", "-C", str(ENGINE), *args],
                                       text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def _pulled_at():
    log = FACTORY / "update.log"
    try:
        starts = [ln for ln in log.read_text(encoding="utf-8").splitlines()
                  if ln.startswith("=== ") and "update start" in ln]
        return starts[-1].replace("=== ", "").replace(" update start ===", "") if starts else ""
    except Exception:
        return ""


def engine_info():
    vf = ENGINE / "VERSION"
    return {
        "version": vf.read_text(encoding="utf-8").strip() if vf.exists() else "?",
        "sha": _git("rev-parse", "--short", "HEAD"),
        "branch": _git("rev-parse", "--abbrev-ref", "HEAD"),
        "committed": _git("log", "-1", "--format=%cd", "--date=format:%Y-%m-%d %H:%M"),
        "pulled": _pulled_at(),
    }


def read_ideas():
    try:
        import yaml
        f = DATA / "library" / "idea-bank" / "queue.yaml"
        if not f.exists():
            return []
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        items = data.get("items") if isinstance(data, dict) else data
        return items or []
    except Exception:
        return []


RUNS_DIR = DATA / "platform"
RUNS_FILE = RUNS_DIR / "runs.json"


def load_runs():
    try:
        return json.loads(RUNS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return []


def save_run(rec):
    try:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        runs = load_runs()
        runs.insert(0, rec)
        RUNS_FILE.write_text(json.dumps(runs[:100], ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception:
        pass


def _run_env():
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ENGINE)
    env["CONTENT_AGENTS_DATA"] = str(DATA)
    env["PYTHONUNBUFFERED"] = "1"
    return env


@app.get("/api/health")
def api_health():
    return {"ok": True, "engine_dir": str(ENGINE), "data_dir": str(DATA), "backend": LLM_BACKEND}


@app.get("/api/engine")
def api_engine():
    return engine_info()


@app.get("/api/ideas")
def api_ideas():
    return read_ideas()


@app.get("/api/runs")
def api_runs():
    return load_runs()


@app.get("/api/workflows/{wid}")
def api_workflow(wid):
    return {"id": wid, "stages": SEO_STAGES, "labels": STAGE_RU}


def _systemctl(*a):
    try:
        return subprocess.check_output(["systemctl", *a], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def _tail(path, n=24):
    try:
        return "\n".join(pathlib.Path(path).read_text(encoding="utf-8").splitlines()[-n:])
    except Exception:
        return ""


@app.get("/api/schedule")
def api_schedule():
    def prop(unit, p):
        return _systemctl("show", unit, "-p", p, "--value")
    return {
        "timers": [{
            "unit": "factory-update.timer",
            "desc": "Автообновление движка с git (git pull + валидация workflow)",
            "active": _systemctl("is-active", "factory-update.timer"),
            "next": prop("factory-update.timer", "NextElapseUSecRealtime"),
            "last": prop("factory-update.timer", "LastTriggerUSec"),
        }],
        "services": [{
            "unit": "factory-web.service",
            "desc": "Веб-панель и API платформы",
            "active": _systemctl("is-active", "factory-web.service"),
        }],
        "update_log": _tail(FACTORY / "update.log", 24),
    }


@app.post("/api/engine/update")
def api_engine_update():
    try:
        subprocess.run(["sudo", "-n", "systemctl", "start", "factory-update.service"],
                       check=True, timeout=180, stderr=subprocess.DEVNULL)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/schedule/timer")
def api_timer_toggle(payload: dict):
    on = bool((payload or {}).get("enabled", True))
    try:
        subprocess.run(["sudo", "-n", "systemctl", "start" if on else "stop", "factory-update.timer"],
                       check=True, timeout=30, stderr=subprocess.DEVNULL)
        return {"ok": True, "enabled": on}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.get("/api/runs/{rid}")
def api_run_detail(rid: str):
    for r in load_runs():
        if r.get("run_id") == rid:
            return r
    return JSONResponse({"error": "not found"}, status_code=404)


@app.websocket("/api/runs/ws")
async def run_ws(ws: WebSocket):
    await ws.accept()
    try:
        req = await ws.receive_json()
    except Exception:
        await ws.close()
        return

    topic = (req or {}).get("topic") or "Тестовая тема"
    wf = (req or {}).get("workflow") or "seo-article"
    run_id = uuid.uuid4().hex[:8]
    started = time.time()

    cmd = [PYBIN, "-m", "backend.codex_runner", "--workflow", wf,
           "--backend", LLM_BACKEND, "--autofill", "--profile", RUN_PROFILE,
           "--prefill-json", json.dumps({"topic": topic}, ensure_ascii=False), "--json"]
    if LLM_BACKEND != "echo" and LLM_BASE_URL:
        cmd += ["--base-url", LLM_BASE_URL]

    await ws.send_json({"type": "start", "run_id": run_id, "workflow": wf, "topic": topic,
                        "stages": SEO_STAGES, "labels": STAGE_RU, "backend": LLM_BACKEND})

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, cwd=str(ENGINE), env=_run_env(),
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    except Exception as e:
        await ws.send_json({"type": "error", "message": str(e)})
        await ws.close()
        return

    try:
        assert proc.stderr is not None
        async for raw in proc.stderr:
            line = raw.decode("utf-8", "replace").rstrip()
            if not line:
                continue
            await ws.send_json({"type": "log", "line": line})
            m = LINE_RE.search(line)
            if m:
                await ws.send_json({"type": "stage", "stage": m.group(2),
                                    "status": m.group(1), "detail": m.group(3)})

        out = (await proc.stdout.read()).decode("utf-8", "replace") if proc.stdout else ""
        await proc.wait()
        result = {}
        try:
            result = json.loads(out) if out.strip() else {}
        except Exception:
            result = {}
        seconds = round(time.time() - started)
        rec = {"run_id": run_id, "workflow": wf, "topic": topic, "backend": LLM_BACKEND,
               "completeness": result.get("execution_completeness"),
               "ready": result.get("ready"), "seconds": seconds,
               "ts": time.strftime("%Y-%m-%d %H:%M")}
        save_run(rec)
        await ws.send_json({"type": "done", "result": {
            "completeness": result.get("execution_completeness"),
            "ready": result.get("ready"), "seconds": seconds}})
    except WebSocketDisconnect:
        try:
            proc.kill()
        except Exception:
            pass
    except Exception as e:
        try:
            await ws.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass


@app.get("/")
def index():
    return FileResponse(str(WEB / "index.html"))
