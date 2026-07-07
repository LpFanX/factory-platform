"""Автономный тик фабрики: следующая одобренная идея → прогон (с учётом стоимости
и предохранителями) → запись в SQLite платформы (стадии/цена/текст) → идея done.

Вызывается из factory.sh по таймеру. Автопилот и шлюз/профиль берутся из настроек
платформы (settings.json). Ключ/base_url/карту тиров наследует от systemd
(EnvironmentFile=.env у factory-scheduler.service) — НЕ через `. .env` (brace-expansion).
"""
import os
import sys
import json
import time
import uuid
import pathlib

FACTORY = pathlib.Path("/home/ubuntu/factory")
ENGINE = os.environ.get("ENGINE_DIR", "/home/ubuntu/content-agents")
os.environ.setdefault("CONTENT_AGENTS_DATA", "/home/ubuntu/factory-data")
DATA = pathlib.Path(os.environ["CONTENT_AGENTS_DATA"])
QUEUE = DATA / "library" / "idea-bank" / "queue.yaml"

sys.path.insert(0, str(FACTORY))
sys.path.insert(0, ENGINE)
sys.path.insert(0, str(pathlib.Path(ENGINE) / "scripts"))

from server import store
from server.run_agent import _wrap_client, RunAbort


def main():
    s = store.get_settings()
    if not s.get("autopilot_enabled"):
        print("autopilot off — skip", flush=True)
        return

    import idea_bank as ib
    from backend.codex_runner import run_workflow, build_backend

    data = ib.load_queue(QUEUE)
    idea = ib.next_approved(data)
    if not idea:
        print("нет одобренных идей — skip", flush=True)
        return

    topic = idea["topic"]
    wf = idea.get("workflow") or "seo-article"
    profile = s.get("profile", "economy")
    backend_name = s.get("backend", "echo")
    run_id = uuid.uuid4().hex[:8]
    started = time.time()
    print(f"tick: идея {idea['id']} · {topic} · {backend_name}/{profile}", flush=True)

    cost = {"cost_rub_total": 0.0, "balance": None, "per_model": {}}

    def sink(model, i, o, cr, bal, cached):
        if cr is not None:
            cost["cost_rub_total"] += float(cr)
        if bal is not None:
            cost["balance"] = float(bal)
        m = cost["per_model"].setdefault(model or "?", {"calls": 0, "in": 0, "out": 0, "cost_rub": 0.0})
        m["calls"] += 1
        if i:
            m["in"] += int(i)
        if o:
            m["out"] += int(o)
        if cr is not None:
            m["cost_rub"] += float(cr)
        cap = float(s.get("max_cost_per_run_rub") or 0)
        if cap and cost["cost_rub_total"] > cap:
            raise RunAbort(f"cost cap {cap} ₽ exceeded")

    if backend_name == "echo":
        backend = build_backend("echo")
        llm_type = "anthropic"
    else:
        backend = build_backend("openai", model="claude-sonnet-4.6", base_url=(os.environ.get("LLM_BASE_URL") or None))
        backend._client = _wrap_client(backend._client, sink)
        if s.get("max_tokens"):
            backend.max_tokens = int(s["max_tokens"])
        backend._max_tool_iterations = 2
        backend._extra["extra_body"] = {"session_id": "tick-" + run_id, "cache_control": {"type": "ephemeral"}}
        llm_type = "openai"

    def prog(stage, status, det):
        print(f"  · [{status}] {stage}: {det}", flush=True)

    result = None
    err = None
    try:
        result = run_workflow(wf, prefill={"topic": topic}, backend=backend, autofill_missing=True,
                              process_profile=profile, llm_type=llm_type, on_progress=prog)
    except RunAbort as e:
        err = f"budget: {e}"
    except Exception as e:
        err = f"{type(e).__name__}: {e}"

    out = result.to_dict() if result is not None else {"ready": False, "pipeline": {"stages": []}}
    ready = bool(out.get("ready")) and not err
    rate = {}
    for mdl, mm in cost["per_model"].items():
        toks = (mm.get("in") or 0) + (mm.get("out") or 0)
        rate[mdl] = (mm.get("cost_rub") or 0) / toks if toks else 0.0
    stage_metrics = []
    for st in ((out.get("pipeline") or {}).get("stages") or []):
        it, ot, mdl = st.get("input_tokens"), st.get("output_tokens"), st.get("model")
        toks = (it or 0) + (ot or 0)
        stage_metrics.append({"stage": st.get("agent") or st.get("name"), "model": mdl, "in": it, "out": ot,
                              "cost_rub": round(toks * rate.get(mdl, 0.0), 4) if toks else 0.0})
    review_required = s.get("review_required", True)
    status = ("awaiting_review" if review_required else "done") if ready else "failed"
    store.save_run({
        "run_id": run_id, "workflow": wf, "topic": topic, "backend": backend_name, "profile": profile,
        "status": status, "completeness": out.get("execution_completeness"), "ready": 1 if ready else 0,
        "seconds": round(time.time() - started), "cost": round(cost["cost_rub_total"], 4), "balance": cost["balance"],
        "per_model_json": json.dumps(cost["per_model"], ensure_ascii=False),
        "stages_json": json.dumps(stage_metrics, ensure_ascii=False),
        "output": out.get("final_output"),
        "ts": time.strftime("%Y-%m-%d %H:%M"), "ts_epoch": time.time(),
    })
    store.log_activity("autopilot_run", "run", f"{run_id}: {status} · {round(cost['cost_rub_total'],2)} ₽ · {topic}")
    # идея обработана — done (не зациклится на следующем тике)
    try:
        ib.set_status(data, idea["id"], "done", date=time.strftime("%Y-%m-%d"))
        ib.save_queue(data, QUEUE)
    except Exception as e:
        print("не смог пометить идею done:", e, flush=True)
    print(f"tick done: {status} · {round(cost['cost_rub_total'],2)} ₽ · err={err}", flush=True)


if __name__ == "__main__":
    main()
