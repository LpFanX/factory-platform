"""Content Factory — платформа (обёртка над движком content-agents).

Движок — read-only клон (ENGINE_DIR, обновляется с git). Данные — CONTENT_AGENTS_DATA.
Движок дёргается CLI-подпроцессом (codex_runner / idea_bank / factory_run), прогресс
стримится по WebSocket. Персистентность — server/store.py (SQLite + settings.json).
"""
import os
import re
import json
import time
import uuid
import asyncio
import pathlib
import subprocess
import urllib.request

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse

from server import store

FACTORY = pathlib.Path(__file__).resolve().parent.parent
ENGINE = pathlib.Path(os.environ.get("ENGINE_DIR", "/home/ubuntu/content-agents"))
DATA = pathlib.Path(os.environ.get("CONTENT_AGENTS_DATA", "/home/ubuntu/factory-data"))
PYBIN = os.environ.get("PYBIN", str(FACTORY / ".venv" / "bin" / "python"))
LLM_BASE_URL = os.environ.get("LLM_BASE_URL", "")
WEB = FACTORY / "web"
QUEUE = DATA / "library" / "idea-bank" / "queue.yaml"   # очередь идей — в DATA, НЕ в клоне

SEO_STAGES = ["seo-researcher", "seo-writer", "content-editor", "seo-fact-checker", "final-trust-editor"]
STAGE_RU = {"seo-researcher": "Исследователь", "seo-writer": "Автор", "content-editor": "Редактор",
            "seo-fact-checker": "Факт-чек", "final-trust-editor": "Финал"}
LINE_RE = re.compile(r"\[(\w+)\]\s*([A-Za-z0-9_\-]+)\s*:?\s*(.*)")

app = FastAPI(title="Content Factory Platform")
store.init()


def _git(*args):
    try:
        return subprocess.check_output(["git", "-C", str(ENGINE), *args], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def _pulled_at():
    try:
        starts = [ln for ln in (FACTORY / "update.log").read_text(encoding="utf-8").splitlines()
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


def _run_env():
    env = dict(os.environ)
    env["PYTHONPATH"] = str(ENGINE)
    env["CONTENT_AGENTS_DATA"] = str(DATA)
    env["PYTHONUNBUFFERED"] = "1"
    return env


def read_ideas():
    try:
        import yaml
        f = DATA / "library" / "idea-bank" / "queue.yaml"
        if not f.exists():
            return []
        data = yaml.safe_load(f.read_text(encoding="utf-8")) or {}
        items = data.get("ideas") if isinstance(data, dict) else data
        return items or []
    except Exception:
        return []


def _idea_bank(*args, timeout=30):
    QUEUE.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run([PYBIN, "scripts/idea_bank.py", "--queue", str(QUEUE), *args],
                       cwd=str(ENGINE), env=_run_env(),
                       check=True, timeout=timeout, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True, ""
    except subprocess.CalledProcessError as e:
        return False, f"idea_bank exit {e.returncode}"
    except Exception as e:
        return False, str(e)


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


# ---------- read endpoints ----------
@app.get("/api/health")
def api_health():
    return {"ok": True, "engine_dir": str(ENGINE), "data_dir": str(DATA)}


@app.get("/api/engine")
def api_engine():
    return engine_info()


@app.get("/api/ideas")
def api_ideas():
    return read_ideas()


@app.get("/api/runs")
def api_runs():
    return store.load_runs()


@app.get("/api/runs/{rid}")
def api_run_detail(rid: str):
    r = store.get_run(rid)
    return r or JSONResponse({"error": "not found"}, status_code=404)


@app.get("/api/runs/{rid}/content")
def api_run_content(rid: str):
    r = store.get_run(rid) or {}
    return {"content": r.get("output") or "", "topic": r.get("topic")}


@app.get("/api/workflows/{wid}")
def api_workflow(wid):
    return {"id": wid, "stages": SEO_STAGES, "labels": STAGE_RU}


@app.get("/api/settings")
def api_get_settings():
    return store.get_settings()


@app.get("/api/activity")
def api_activity():
    return store.get_activity()


def _aitunnel_get(path: str):
    key = os.environ.get("OPENAI_API_KEY")
    base = (os.environ.get("LLM_BASE_URL") or "https://api.aitunnel.ru/v1").rstrip("/")
    if not key:
        return {"error": "no key"}
    try:
        req = urllib.request.Request(base + path, headers={"Authorization": "Bearer " + key})
        with urllib.request.urlopen(req, timeout=12) as r:
            return json.loads(r.read().decode("utf-8"))
    except Exception as e:
        return {"error": str(e)}


@app.get("/api/aitunnel/balance")
def api_ai_balance():
    return _aitunnel_get("/aitunnel/balance")


@app.get("/api/aitunnel/stats")
def api_ai_stats():
    return _aitunnel_get("/aitunnel/stats/summary")


@app.get("/api/schedule")
def api_schedule():
    def prop(unit, p):
        return _systemctl("show", unit, "-p", p, "--value")
    s = store.get_settings()
    return {
        "autopilot_enabled": s["autopilot_enabled"],
        "timers": [{
            "unit": "factory-update.timer", "kind": "update",
            "desc": "Автообновление движка с git (git pull + валидация)",
            "active": _systemctl("is-active", "factory-update.timer"),
            "next": prop("factory-update.timer", "NextElapseUSecRealtime"),
            "last": prop("factory-update.timer", "LastTriggerUSec"),
        }, {
            "unit": "factory-scheduler.timer", "kind": "factory",
            "desc": "Автономная фабрика: следующая одобренная идея → прогон (по расписанию)",
            "active": _systemctl("is-active", "factory-scheduler.timer"),
            "next": prop("factory-scheduler.timer", "NextElapseUSecRealtime"),
            "last": prop("factory-scheduler.timer", "LastTriggerUSec"),
        }],
        "services": [{"unit": "factory-web.service", "desc": "Веб-панель и API",
                      "active": _systemctl("is-active", "factory-web.service")}],
        "update_log": _tail(FACTORY / "update.log", 24),
        "factory_log": _tail(FACTORY / "factory.log", 24),
    }


# ---------- write endpoints ----------
@app.post("/api/settings")
def api_set_settings(payload: dict):
    s = store.save_settings(payload or {})
    store.log_activity("settings_updated", "settings", json.dumps({k: payload.get(k) for k in (payload or {})}, ensure_ascii=False))
    return s


@app.post("/api/ideas")
def api_idea_add(payload: dict):
    topic = ((payload or {}).get("topic") or "").strip()
    if not topic:
        return JSONResponse({"error": "empty topic"}, status_code=400)
    wf = (payload or {}).get("workflow") or "seo-article"
    ok, err = _idea_bank("--add", "--topic", topic, "--source", "human", "--workflow", wf)
    store.log_activity("idea_added" if ok else "idea_add_failed", "idea", topic)
    return {"ok": ok, "error": err}


@app.post("/api/ideas/{iid}/{action}")
def api_idea_action(iid: str, action: str):
    if action not in ("approve", "reject"):
        return JSONResponse({"error": "bad action"}, status_code=400)
    ok, err = _idea_bank("--" + action, iid)
    store.log_activity("idea_" + action, "idea", iid)
    return {"ok": ok, "error": err}


@app.post("/api/runs/{rid}/review")
def api_run_review(rid: str, payload: dict):
    decision = (payload or {}).get("decision")
    if decision not in ("accept", "rework"):
        return JSONResponse({"error": "bad decision"}, status_code=400)
    status = store.set_review(rid, decision)
    store.log_activity("run_" + decision, "run", rid)
    return {"ok": True, "status": status}


@app.post("/api/engine/update")
def api_engine_update():
    try:
        subprocess.run(["sudo", "-n", "systemctl", "start", "factory-update.service"],
                       check=True, timeout=180, stderr=subprocess.DEVNULL)
        store.log_activity("engine_update", "engine", "manual")
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@app.post("/api/schedule/timer")
def api_timer_toggle(payload: dict):
    unit = (payload or {}).get("unit", "factory-update.timer")
    if unit not in ("factory-update.timer", "factory-scheduler.timer"):
        return JSONResponse({"error": "bad unit"}, status_code=400)
    on = bool((payload or {}).get("enabled", True))
    try:
        subprocess.run(["sudo", "-n", "systemctl", "start" if on else "stop", unit],
                       check=True, timeout=30, stderr=subprocess.DEVNULL)
        store.log_activity("timer_" + ("start" if on else "stop"), "timer", unit)
        return {"ok": True, "enabled": on}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---------- run (WebSocket) ----------
@app.websocket("/api/runs/ws")
async def run_ws(ws: WebSocket):
    await ws.accept()
    try:
        req = await ws.receive_json()
    except Exception:
        await ws.close()
        return

    settings = store.get_settings()
    topic = (req or {}).get("topic") or "Тестовая тема"
    wf = (req or {}).get("workflow") or "seo-article"
    backend = (req or {}).get("backend") or settings["backend"]
    profile = (req or {}).get("profile") or settings["profile"]
    run_id = uuid.uuid4().hex[:8]
    started = time.time()
    stage_events: list = []

    cmd = [PYBIN, str(FACTORY / "server" / "run_agent.py"), "--workflow", wf,
           "--backend", backend, "--profile", profile, "--topic", topic,
           "--max-cost-rub", str(settings.get("max_cost_per_run_rub", 30)),
           "--max-tokens", str(settings.get("max_tokens", 3000))]
    if backend != "echo" and LLM_BASE_URL:
        cmd += ["--base-url", LLM_BASE_URL]

    await ws.send_json({"type": "start", "run_id": run_id, "workflow": wf, "topic": topic,
                        "stages": SEO_STAGES, "labels": STAGE_RU, "backend": backend})
    store.log_activity("run_started", "run", f"{run_id}: {topic}")

    try:
        proc = await asyncio.create_subprocess_exec(*cmd, cwd=str(ENGINE), env=_run_env(),
                                                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
    except Exception as e:
        await ws.send_json({"type": "error", "message": str(e)})
        await ws.close()
        return

    status = "failed"
    result: dict = {}
    try:
        assert proc.stderr is not None
        async for raw in proc.stderr:
            line = raw.decode("utf-8", "replace").rstrip()
            if not line:
                continue
            await ws.send_json({"type": "log", "line": line})
            m = LINE_RE.search(line)
            if m:
                ev = {"stage": m.group(2), "status": m.group(1)}
                stage_events.append(ev)
                await ws.send_json({"type": "stage", "stage": m.group(2), "status": m.group(1), "detail": m.group(3)})

        out = (await proc.stdout.read()).decode("utf-8", "replace") if proc.stdout else ""
        await proc.wait()
        try:
            result = json.loads(out) if out.strip() else {}
        except Exception:
            result = {}
        ready = bool(result.get("ready"))
        review_required = store.get_settings()["review_required"]
        status = ("awaiting_review" if review_required else "done") if ready else "failed"
        seconds = round(time.time() - started)
        ai = result.get("aitunnel") or {}
        cost_rub = float(ai.get("cost_rub_total") or 0) or 0.0
        balance = ai.get("balance")
        per_model = ai.get("per_model") or {}
        rate = {}
        for mdl, mm in per_model.items():
            toks = (mm.get("in") or 0) + (mm.get("out") or 0)
            rate[mdl] = (mm.get("cost_rub") or 0) / toks if toks else 0.0
        pstages = ((result.get("pipeline") or {}).get("stages")) or []
        stage_metrics = []
        total_chars = 0
        for s in pstages:
            it, ot, mdl = s.get("input_tokens"), s.get("output_tokens"), s.get("model")
            toks = (it or 0) + (ot or 0)
            total_chars += s.get("output_chars") or 0
            stage_metrics.append({"stage": s.get("agent") or s.get("name"), "model": mdl,
                                  "in": it, "out": ot, "cost_rub": round(toks * rate.get(mdl, 0.0), 4) if toks else 0.0})
        store.save_run({
            "run_id": run_id, "workflow": wf, "topic": topic, "backend": backend, "profile": profile,
            "status": status, "completeness": result.get("execution_completeness"), "ready": 1 if ready else 0,
            "seconds": seconds, "chars": total_chars, "cost": cost_rub, "balance": balance,
            "stages_json": json.dumps(stage_metrics, ensure_ascii=False),
            "per_model_json": json.dumps(per_model, ensure_ascii=False),
            "output": result.get("final_output"),
            "ts": time.strftime("%Y-%m-%d %H:%M"), "ts_epoch": time.time(),
        })
        store.log_activity("run_finished", "run", f"{run_id}: {status} · {cost_rub} ₽")
        await ws.send_json({"type": "done", "result": {
            "completeness": result.get("execution_completeness"), "ready": ready,
            "seconds": seconds, "status": status, "run_id": run_id,
            "cost_rub": cost_rub, "balance": balance, "stage_metrics": stage_metrics}})
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
