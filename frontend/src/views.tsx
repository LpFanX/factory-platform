import { useEffect, useState } from "react";
import { json } from "./api";
import { Card } from "./ui";

const fmtT = (s: number) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const clean = (v: string) => (!v || v === "n/a" || v === "0") ? "—" : v;

export function Schedule() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = () => json("/api/schedule").then(setD).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  const runUpdate = async () => {
    setBusy(true);
    await fetch("/api/engine/update", { method: "POST" }).catch(() => {});
    setTimeout(() => { load(); setBusy(false); }, 3000);
  };
  const toggle = async (on: boolean) => {
    await fetch("/api/schedule/timer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: on }) }).catch(() => {});
    setTimeout(load, 400);
  };
  const t = d?.timers?.[0];
  const on = t?.active === "active";

  return (
    <>
      <Card title="Расписание и автообновление" icon="ti-calendar-clock" sub="задачи фабрики по таймерам systemd">
        {t && (
          <div className="border border-line rounded-[14px] p-4 mb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-medium text-[14px] flex items-center gap-2">
                  <i className={"ti " + (on ? "ti-clock-play text-good" : "ti-clock-pause text-faint")} aria-hidden="true"></i>{t.unit}
                </div>
                <div className="text-[12.5px] text-muted mt-0.5">{t.desc}</div>
              </div>
              <span className={"text-[12px] px-2.5 py-1 rounded-full font-medium " + (on ? "bg-good/15 text-good" : "bg-bg2 text-muted")}>{on ? "включён" : "на паузе"}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5 mt-3.5">
              <div className="bg-surface border border-line rounded-[11px] px-3 py-2"><div className="text-[11.5px] text-faint">следующий запуск</div><div className="text-[13.5px] font-medium mt-0.5">{clean(t.next)}</div></div>
              <div className="bg-surface border border-line rounded-[11px] px-3 py-2"><div className="text-[11.5px] text-faint">последний запуск</div><div className="text-[13.5px] font-medium mt-0.5">{clean(t.last)}</div></div>
            </div>
            <div className="flex gap-2.5 mt-3.5 flex-wrap">
              <button onClick={runUpdate} disabled={busy} className="h-9 px-3.5 rounded-[10px] text-white text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50" style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)" }}>
                <i className={"ti " + (busy ? "ti-loader-2 animate-spin" : "ti-refresh")} aria-hidden="true"></i>{busy ? "обновляю…" : "обновить движок сейчас"}
              </button>
              <button onClick={() => toggle(!on)} className="h-9 px-3.5 rounded-[10px] border border-line bg-surface text-[13px] flex items-center gap-1.5">
                <i className={"ti " + (on ? "ti-player-pause" : "ti-player-play")} aria-hidden="true"></i>{on ? "поставить на паузу" : "включить"}
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2">
          {(d?.services || []).map((s: any, i: number) => (
            <div key={i} className="flex items-center justify-between bg-surface border border-line rounded-[11px] px-3.5 py-2.5 text-[13px]">
              <span><i className="ti ti-server-2 text-muted mr-1.5" aria-hidden="true"></i>{s.desc} <span className="text-faint">· {s.unit}</span></span>
              <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium " + (s.active === "active" ? "bg-good/15 text-good" : "bg-danger/15 text-danger")}>{s.active}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Журнал обновлений" icon="ti-file-text" sub="лог git-таймера движка" className="mt-4">
        <div className="logbox rounded-[12px] p-3.5 max-h-[280px] overflow-auto font-mono text-[12px] leading-[1.6]" style={{ background: "#1c1a15", color: "#d7cfbf" }}>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{d?.update_log || "— лог пуст —"}</pre>
        </div>
      </Card>
    </>
  );
}

export function RunsView({ runs }: any) {
  const [sel, setSel] = useState<any>(null);
  return (
    <div className="grid lg:grid-cols-[1.3fr_1fr] gap-4 items-start">
      <Card title="Прогоны" icon="ti-history" sub="история фабрики — кликни для деталей">
        <div className="flex flex-col gap-2.5">
          {(!runs || !runs.length) && <div className="text-[13px] text-faint py-2">пока нет прогонов</div>}
          {(runs || []).map((r: any, i: number) => (
            <div key={i} onClick={() => setSel(r)} className={"flex items-center justify-between gap-2.5 border rounded-[11px] px-3.5 py-2.5 text-[13px] cursor-pointer " + (sel === r ? "border-purple bg-purple/5" : "border-line bg-surface hover:border-teal")}>
              <span className="truncate">{r.topic || r.workflow}</span>
              <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap " + (r.ready ? "bg-good/15 text-good" : "bg-bg2 text-muted")}>{(r.completeness || "—") + " · " + fmtT(r.seconds || 0)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Детали прогона" icon="ti-zoom-scan">
        {!sel ? <div className="text-[13px] text-faint py-2">выбери прогон слева</div> : (
          <div className="text-[13.5px]">
            <div className="font-medium mb-3">{sel.topic}</div>
            {[["workflow", sel.workflow], ["шлюз", sel.backend], ["результат", sel.completeness], ["готов", sel.ready ? "да" : "нет"], ["время", fmtT(sel.seconds || 0)], ["когда", sel.ts], ["run_id", sel.run_id]].map(([k, v]: any) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-line last:border-0"><span className="text-muted">{k}</span><span className="font-medium font-mono text-[12.5px]">{String(v ?? "—")}</span></div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function ApprovalsView({ run, runs }: any) {
  const pending = run.status === "gate";
  return (
    <>
      <Card title="Согласования" icon="ti-checkup" sub="точки контроля человека в конвейере">
        {pending ? (
          <div className="border rounded-[12px] px-4 py-3.5" style={{ borderColor: "rgba(217,138,22,.4)", background: "rgba(217,138,22,.09)" }}>
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              <span className="text-[13.5px] text-amber"><i className="ti ti-hand-stop mr-1.5" aria-hidden="true"></i>прогон ждёт решения: черновик готов — публиковать?</span>
              <span className="flex gap-2">
                <button onClick={run.approve} className="h-9 px-3.5 rounded-[10px] text-white text-[13px] font-medium flex items-center gap-1.5" style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)" }}><i className="ti ti-check" aria-hidden="true"></i>Принять</button>
                <button onClick={run.approve} className="h-9 px-3.5 rounded-[10px] border border-line bg-surface text-[13px] flex items-center gap-1.5"><i className="ti ti-rotate" aria-hidden="true"></i>На доработку</button>
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[13px] text-muted py-1">Нет ожидающих согласований. Гейт появляется во время прогона, когда отрабатывает агент-редактор (оценка качества).</div>
        )}
        <div className="text-[12.5px] text-faint mt-3 leading-relaxed">
          Постоянная очередь согласований и дубль в VK Workspace бот (кнопки «принять/на доработку» прямо в мессенджере) — на Фазе 3.
        </div>
      </Card>
      <Card title="Недавние решения" icon="ti-history" sub="последние прогоны" className="mt-4">
        <div className="flex flex-col gap-2.5">
          {(!runs || !runs.length) && <div className="text-[13px] text-faint py-2">пока нет прогонов</div>}
          {(runs || []).slice(0, 6).map((r: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-2.5 bg-surface border border-line rounded-[11px] px-3.5 py-2.5 text-[13px]">
              <span className="truncate">{r.topic || r.workflow}</span>
              <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium " + (r.ready ? "bg-good/15 text-good" : "bg-bg2 text-muted")}>{r.ready ? "принято" : (r.completeness || "—")}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
