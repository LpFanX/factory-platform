"""Раннер-обёртка над движком: прогон workflow + учёт токенов/стоимости AITunnel
+ ЖЁСТКИЕ предохранители по расходу.

Предохранители:
- `--max-cost-rub N` — как только суммарный `cost_rub` за прогон превысит N,
  следующий вызов не делается: бросаем RunAbort → прогон обрывается. Защита от
  runaway (ReAct-циклы, ретраи на падающей стадии).
- `--max-tokens N` — потолок выходных токенов на каждый вызов (bound на длину).
- лимит итераций инструментов на стадию (реже циклы ReAct).
- `session_id` на прогон — тёплый кэш промптов AITunnel (повторный контекст ~0.1×).
- Стоимость печатается ВСЕГДА (в finally), даже если прогон упал/оборван — деньги
  всегда видны (иначе спишутся молча, как в инциденте 2026-07-07).
"""
import os
import sys
import json
import uuid
import argparse


class RunAbort(Exception):
    pass


def _wrap_client(real, sink):
    class _Comp:
        def __init__(self, rc):
            self._rc = rc

        def create(self, **kw):
            resp = self._rc.create(**kw)
            try:
                u = getattr(resp, "usage", None)
                if u is not None:
                    d = u.model_dump() if hasattr(u, "model_dump") else dict(u)
                    ptd = d.get("prompt_tokens_details") or {}
                    cached = ptd.get("cached_tokens") if isinstance(ptd, dict) else 0
                    sink(kw.get("model"), d.get("prompt_tokens"), d.get("completion_tokens"),
                         d.get("cost_rub"), d.get("balance"), cached or 0)
            except RunAbort:
                raise
            except Exception:
                pass
            return resp

    class _Chat:
        def __init__(self, rc):
            self.completions = _Comp(rc.completions)

    class _Client:
        def __init__(self, rc):
            self.chat = _Chat(rc.chat)

    return _Client(real)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workflow", required=True)
    ap.add_argument("--backend", default="echo")
    ap.add_argument("--profile", default="standard")
    ap.add_argument("--topic", required=True)
    ap.add_argument("--base-url", default=os.environ.get("LLM_BASE_URL", ""))
    ap.add_argument("--model", default="claude-sonnet-4.6")
    ap.add_argument("--max-cost-rub", type=float, default=0.0)  # 0 = без капа
    ap.add_argument("--max-tokens", type=int, default=0)        # 0 = дефолт модели
    a = ap.parse_args()

    from backend.codex_runner import run_workflow, build_backend

    cost = {"cost_rub_total": 0.0, "balance": None, "cached_tokens": 0, "per_model": {}, "aborted": False}

    def sink(model, in_tok, out_tok, cost_rub, balance, cached):
        if cost_rub is not None:
            cost["cost_rub_total"] += float(cost_rub)
        if balance is not None:
            cost["balance"] = float(balance)
        if cached:
            cost["cached_tokens"] += int(cached)
        m = cost["per_model"].setdefault(model or "?", {"calls": 0, "in": 0, "out": 0, "cost_rub": 0.0})
        m["calls"] += 1
        if in_tok:
            m["in"] += int(in_tok)
        if out_tok:
            m["out"] += int(out_tok)
        if cost_rub is not None:
            m["cost_rub"] += float(cost_rub)
        # ЖЁСТКИЙ КАП: превысили — обрываем следующий вызов
        if a.max_cost_rub and cost["cost_rub_total"] > a.max_cost_rub:
            cost["aborted"] = True
            raise RunAbort(f"cost cap {a.max_cost_rub} ₽ exceeded ({round(cost['cost_rub_total'],2)} ₽)")

    if a.backend == "echo":
        backend = build_backend("echo")
        llm_type = "anthropic"
    else:
        backend = build_backend("openai", model=a.model, base_url=(a.base_url or None))
        try:
            backend._client = _wrap_client(backend._client, sink)
            if a.max_tokens:
                backend.max_tokens = a.max_tokens
            backend._max_tool_iterations = 2            # реже ReAct-циклы
            backend._extra["extra_body"] = {          # расширения AITunnel идут в BODY, не top-level kwargs SDK
                "session_id": "run-" + uuid.uuid4().hex[:12],  # sticky-routing → тёплый кэш
                "cache_control": {"type": "ephemeral"},        # автокэш Claude: повтор ~0.1×
            }
        except Exception:
            pass
        llm_type = "openai"

    def on_progress(stage, status, details):
        print(f"  · [{status}] {stage}: {details}", file=sys.stderr, flush=True)

    result = None
    err = None
    try:
        result = run_workflow(
            a.workflow, prefill={"topic": a.topic}, backend=backend,
            autofill_missing=True, process_profile=a.profile, llm_type=llm_type,
            on_progress=on_progress,
        )
    except RunAbort as e:
        err = str(e)
        print(f"  · [aborted] budget: {e}", file=sys.stderr, flush=True)
    except Exception as e:
        err = f"{type(e).__name__}: {e}"
        print(f"  · [error] run: {err}", file=sys.stderr, flush=True)
    finally:
        out = result.to_dict() if result is not None else {"ready": False, "pipeline": {"stages": []}}
        cost["cost_rub_total"] = round(cost["cost_rub_total"], 4)
        for m in cost["per_model"].values():
            m["cost_rub"] = round(m["cost_rub"], 4)
        out["aitunnel"] = cost
        if err:
            out["run_error"] = err
        print(json.dumps(out, ensure_ascii=False))


if __name__ == "__main__":
    main()
