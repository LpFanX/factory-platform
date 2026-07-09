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


# ₽ за 1M входных токенов на AITunnel (для preflight-оценки; матч по префиксу id).
# Кап проверялся только ПОСЛЕ вызова → один вызов на 61k токенов стоил 45 ₽ и
# пробил кап 40 ₽ постфактум (замер 2026-07-09). Preflight не даёт сделать вызов,
# который заведомо не влезает в остаток капа.
_PRICE_IN_RUB_PER_MTOK = {
    "claude-opus": 700, "claude-sonnet": 600, "claude-haiku": 200,
    "sonar": 200, "gpt-4o-mini": 30, "gpt-4o": 250,
}


def _est_call_rub(kw) -> float:
    model = str(kw.get("model") or "")
    rate = 600.0
    for prefix in sorted(_PRICE_IN_RUB_PER_MTOK, key=len, reverse=True):
        if model.startswith(prefix):
            rate = float(_PRICE_IN_RUB_PER_MTOK[prefix])
            break
    chars = 0
    for m in (kw.get("messages") or []):
        c = m.get("content")
        chars += len(c) if isinstance(c, str) else len(str(c or ""))
    return (chars / 3.5) * rate / 1_000_000  # ~3.5 симв/токен для ru-текста


def _wrap_client(real, sink, preflight=None):
    class _Comp:
        def __init__(self, rc):
            self._rc = rc

        def create(self, **kw):
            # Perplexity (sonar-*) не поддерживает function tools — AITunnel отвечает 404.
            # Поиск у sonar нативный, tools ей и не нужны: снимаем их молча.
            if str(kw.get("model") or "").startswith("sonar"):
                kw.pop("tools", None)
                kw.pop("tool_choice", None)
            if preflight is not None:
                preflight(kw)
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

    def preflight(kw):
        # не делаем вызов, который по оценке не влезает в остаток капа
        if not a.max_cost_rub:
            return
        est = _est_call_rub(kw)
        if cost["cost_rub_total"] + est > a.max_cost_rub:
            cost["aborted"] = True
            raise RunAbort(
                f"preflight: вызов ~{est:.1f} ₽ ({kw.get('model')}) превысит кап "
                f"{a.max_cost_rub} ₽ (потрачено {cost['cost_rub_total']:.2f} ₽)")

    if a.backend == "echo":
        backend = build_backend("echo")
        llm_type = "anthropic"
    else:
        backend = build_backend("openai", model=a.model, base_url=(a.base_url or None))
        try:
            backend._client = _wrap_client(backend._client, sink, preflight)
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
