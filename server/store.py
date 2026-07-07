"""Персистентность платформы: SQLite (прогоны + активность) + JSON-настройки.

Всё живёт в CONTENT_AGENTS_DATA/platform/ (вне клона движка).
"""
import os
import json
import time
import sqlite3
import pathlib
import threading

DATA = pathlib.Path(os.environ.get("CONTENT_AGENTS_DATA", "/home/ubuntu/factory-data"))
PDIR = DATA / "platform"
PDIR.mkdir(parents=True, exist_ok=True)
DB = PDIR / "factory.db"
SETTINGS_FILE = PDIR / "settings.json"
_lock = threading.Lock()

DEFAULT_SETTINGS = {
    "backend": "echo",            # echo | openai (AITunnel)
    "profile": "standard",        # economy | standard | full
    "autopilot_enabled": False,   # автономный планировщик берёт идеи сам
    "review_required": True,      # готовый прогон уходит в ревью (принять/на доработку)
    "max_cost_per_run_rub": 30,   # ЖЁСТКИЙ кап стоимости прогона (₽); прогон обрывается при превышении
    "max_tokens": 3000,           # потолок выходных токенов на каждый вызов
    "low_balance_rub": 100,       # порог алерта низкого баланса AITunnel
}


def _conn():
    c = sqlite3.connect(str(DB), timeout=8, check_same_thread=False)
    c.row_factory = sqlite3.Row
    return c


def init():
    with _conn() as c:
        c.execute("""CREATE TABLE IF NOT EXISTS runs(
            run_id TEXT PRIMARY KEY, workflow TEXT, topic TEXT, backend TEXT, profile TEXT,
            status TEXT, completeness TEXT, ready INTEGER, seconds INTEGER, chars INTEGER,
            cost REAL, balance REAL, per_model_json TEXT, stages_json TEXT, output TEXT, review TEXT, ts TEXT, ts_epoch REAL)""")
        for col, typ in (("balance", "REAL"), ("per_model_json", "TEXT"), ("output", "TEXT")):
            try:
                c.execute(f"ALTER TABLE runs ADD COLUMN {col} {typ}")
            except Exception:
                pass
        c.execute("""CREATE TABLE IF NOT EXISTS activity(
            id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, actor TEXT,
            action TEXT, entity TEXT, detail TEXT)""")
    _migrate_runs_json()


def _migrate_runs_json():
    f = PDIR / "runs.json"
    if not f.exists():
        return
    try:
        old = json.loads(f.read_text(encoding="utf-8"))
        with _conn() as c:
            for r in old:
                c.execute(
                    "INSERT OR IGNORE INTO runs(run_id,workflow,topic,backend,status,completeness,ready,seconds,ts,ts_epoch) "
                    "VALUES(?,?,?,?,?,?,?,?,?,?)",
                    (r.get("run_id"), r.get("workflow"), r.get("topic"), r.get("backend"),
                     "done" if r.get("ready") else "failed", r.get("completeness"),
                     1 if r.get("ready") else 0, r.get("seconds"), r.get("ts"), 0),
                )
        f.rename(f.with_name("runs.json.migrated"))
    except Exception:
        pass


def save_run(rec: dict):
    row = {"run_id": None, "workflow": None, "topic": None, "backend": None, "profile": None,
           "status": None, "completeness": None, "ready": 0, "seconds": 0, "chars": 0,
           "cost": 0.0, "balance": None, "per_model_json": None, "stages_json": None, "output": None,
           "review": None, "ts": None, "ts_epoch": time.time()}
    row.update({k: v for k, v in rec.items() if k in row})
    with _lock, _conn() as c:
        c.execute("""INSERT OR REPLACE INTO runs
            (run_id,workflow,topic,backend,profile,status,completeness,ready,seconds,chars,cost,balance,per_model_json,stages_json,output,review,ts,ts_epoch)
            VALUES(:run_id,:workflow,:topic,:backend,:profile,:status,:completeness,:ready,:seconds,:chars,:cost,:balance,:per_model_json,:stages_json,:output,:review,:ts,:ts_epoch)""", row)


def load_runs(limit=100):
    with _conn() as c:
        return [dict(r) for r in c.execute("SELECT * FROM runs ORDER BY ts_epoch DESC LIMIT ?", (limit,)).fetchall()]


def get_run(rid: str):
    with _conn() as c:
        r = c.execute("SELECT * FROM runs WHERE run_id=?", (rid,)).fetchone()
        return dict(r) if r else None


def set_review(rid: str, decision: str):
    status = "accepted" if decision == "accept" else "reworked"
    with _lock, _conn() as c:
        c.execute("UPDATE runs SET review=?, status=? WHERE run_id=?", (decision, status, rid))
    return status


def log_activity(action: str, entity: str = "", detail: str = "", actor: str = "web"):
    with _lock, _conn() as c:
        c.execute("INSERT INTO activity(ts,actor,action,entity,detail) VALUES(?,?,?,?,?)",
                  (time.strftime("%Y-%m-%d %H:%M"), actor, action, entity, detail))


def get_activity(limit=60):
    with _conn() as c:
        return [dict(r) for r in c.execute("SELECT ts,actor,action,entity,detail FROM activity ORDER BY id DESC LIMIT ?", (limit,)).fetchall()]


def get_settings():
    try:
        s = json.loads(SETTINGS_FILE.read_text(encoding="utf-8"))
    except Exception:
        s = {}
    return {**DEFAULT_SETTINGS, **{k: v for k, v in s.items() if k in DEFAULT_SETTINGS}}


def save_settings(patch: dict):
    s = get_settings()
    for k, v in (patch or {}).items():
        if k in DEFAULT_SETTINGS:
            s[k] = v
    SETTINGS_FILE.write_text(json.dumps(s, ensure_ascii=False, indent=2), encoding="utf-8")
    return s
