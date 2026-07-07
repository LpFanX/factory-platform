import { useEffect, useState } from "react";
import { json, post } from "./api";
import { Card } from "./ui";

const fmtT = (s: number) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const clean = (v: string) => (!v || v === "n/a" || v === "0") ? "—" : v;

export function Schedule() {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState("");
  const load = () => json("/api/schedule").then(setD).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  const runUpdate = async () => { setBusy("update"); await post("/api/engine/update"); setTimeout(() => { load(); setBusy(""); }, 3000); };
  const toggle = async (unit: string, on: boolean) => { await post("/api/schedule/timer", { unit, enabled: on }); setTimeout(load, 500); };

  return (
    <>
      <Card title="Расписание и автономность" icon="ti-calendar-clock" sub="задачи фабрики по таймерам systemd">
        <div className="flex items-center gap-2 mb-3 text-[13px]">
          <span className="text-muted">автопилот генерации:</span>
          <span className={"text-[12px] px-2.5 py-1 rounded-full font-medium " + (d?.autopilot_enabled ? "bg-good/15 text-good" : "bg-bg2 text-muted")}>
            {d?.autopilot_enabled ? "включён" : "выключен"}
          </span>
          <span className="text-faint">· переключается в «Настройки»</span>
        </div>
        {(d?.timers || []).map((t: any, i: number) => {
          const on = t.active === "active";
          return (
            <div key={i} className="border border-line rounded-[14px] p-4 mb-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-medium text-[14px] flex items-center gap-2"><i className={"ti " + (on ? "ti-clock-play text-good" : "ti-clock-pause text-faint")} aria-hidden="true"></i>{t.unit}</div>
                  <div className="text-[12.5px] text-muted mt-0.5">{t.desc}</div>
                </div>
                <span className={"text-[12px] px-2.5 py-1 rounded-full font-medium " + (on ? "bg-good/15 text-good" : "bg-bg2 text-muted")}>{on ? "включён" : "на паузе"}</span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 mt-3.5">
                <div className="bg-surface border border-line rounded-[11px] px-3 py-2"><div className="text-[11.5px] text-faint">следующий запуск</div><div className="text-[13px] font-medium mt-0.5">{clean(t.next)}</div></div>
                <div className="bg-surface border border-line rounded-[11px] px-3 py-2"><div className="text-[11.5px] text-faint">последний запуск</div><div className="text-[13px] font-medium mt-0.5">{clean(t.last)}</div></div>
              </div>
              <div className="flex gap-2.5 mt-3.5 flex-wrap">
                {t.kind === "update" && (
                  <button onClick={runUpdate} disabled={busy === "update"} className="h-9 px-3.5 rounded-[10px] text-white text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50" style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)" }}>
                    <i className={"ti " + (busy === "update" ? "ti-loader-2 animate-spin" : "ti-refresh")} aria-hidden="true"></i>{busy === "update" ? "обновляю…" : "обновить движок сейчас"}
                  </button>
                )}
                <button onClick={() => toggle(t.unit, !on)} className="h-9 px-3.5 rounded-[10px] border border-line bg-surface text-[13px] flex items-center gap-1.5">
                  <i className={"ti " + (on ? "ti-player-pause" : "ti-player-play")} aria-hidden="true"></i>{on ? "поставить на паузу" : "включить"}
                </button>
              </div>
            </div>
          );
        })}
        <div className="flex flex-col gap-2">
          {(d?.services || []).map((s: any, i: number) => (
            <div key={i} className="flex items-center justify-between bg-surface border border-line rounded-[11px] px-3.5 py-2.5 text-[13px]">
              <span><i className="ti ti-server-2 text-muted mr-1.5" aria-hidden="true"></i>{s.desc} <span className="text-faint">· {s.unit}</span></span>
              <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium " + (s.active === "active" ? "bg-good/15 text-good" : "bg-danger/12 text-danger")}>{s.active}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Журналы" icon="ti-file-text" sub="обновление движка и автономные тики" className="mt-4">
        <div className="text-[12px] text-muted mb-1">git-обновление</div>
        <div className="logbox rounded-[12px] p-3 max-h-[190px] overflow-auto font-mono text-[11.5px] leading-[1.55] mb-3" style={{ background: "#1c1a15", color: "#d7cfbf" }}><pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{d?.update_log || "— пусто —"}</pre></div>
        <div className="text-[12px] text-muted mb-1">автономный планировщик</div>
        <div className="logbox rounded-[12px] p-3 max-h-[190px] overflow-auto font-mono text-[11.5px] leading-[1.55]" style={{ background: "#1c1a15", color: "#d7cfbf" }}><pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{d?.factory_log || "— пусто —"}</pre></div>
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
              <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap " + (r.ready ? "bg-good/15 text-good" : "bg-bg2 text-muted")}>{(r.status || r.completeness || "—") + " · " + fmtT(r.seconds || 0)}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="Детали прогона" icon="ti-zoom-scan">
        {!sel ? <div className="text-[13px] text-faint py-2">выбери прогон слева</div> : (
          <div className="text-[13.5px]">
            <div className="font-medium mb-3">{sel.topic}</div>
            {[["workflow", sel.workflow], ["шлюз", sel.backend], ["профиль", sel.profile], ["статус", sel.status], ["результат", sel.completeness], ["время", fmtT(sel.seconds || 0)], ["стоимость", sel.cost ? "₽ " + sel.cost : "—"], ["когда", sel.ts], ["run_id", sel.run_id]].map(([k, v]: any) => (
              <div key={k} className="flex justify-between py-1.5 border-b border-line last:border-0"><span className="text-muted">{k}</span><span className="font-medium font-mono text-[12.5px]">{String(v ?? "—")}</span></div>
            ))}
            {sel.stages_json && <div className="mt-3"><div className="text-[12px] text-faint mb-1">стадии</div><div className="text-[12px] font-mono text-muted">{(JSON.parse(sel.stages_json || "[]") || []).join("  ·  ")}</div></div>}
          </div>
        )}
      </Card>
    </div>
  );
}

export function ApprovalsView({ run, runs, onRefresh }: any) {
  const pending = run.status === "gate";
  const review = (runs || []).filter((r: any) => r.status === "awaiting_review");
  const decide = async (rid: string, decision: string) => { await post(`/api/runs/${rid}/review`, { decision }); onRefresh && onRefresh(); };
  return (
    <>
      <Card title="Согласования и ревью" icon="ti-checkup" sub="точки контроля человека">
        {pending && (
          <div className="border rounded-[12px] px-4 py-3.5 mb-3" style={{ borderColor: "rgba(217,138,22,.4)", background: "rgba(217,138,22,.09)" }}>
            <div className="flex items-center justify-between gap-2.5 flex-wrap">
              <span className="text-[13.5px] text-amber"><i className="ti ti-hand-stop mr-1.5" aria-hidden="true"></i>прогон ждёт решения (гейт редактора)</span>
              <span className="flex gap-2">
                <button onClick={run.approve} className="h-9 px-3.5 rounded-[10px] text-white text-[13px] font-medium flex items-center gap-1.5" style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)" }}><i className="ti ti-check" aria-hidden="true"></i>Принять</button>
                <button onClick={run.approve} className="h-9 px-3.5 rounded-[10px] border border-line bg-surface text-[13px] flex items-center gap-1.5"><i className="ti ti-rotate" aria-hidden="true"></i>На доработку</button>
              </span>
            </div>
          </div>
        )}
        <div className="text-[13px] text-muted mb-2">готовые черновики на вычитке ({review.length})</div>
        <div className="flex flex-col gap-2.5">
          {!review.length && <div className="text-[13px] text-faint py-1">нет черновиков на ревью</div>}
          {review.map((r: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-2.5 bg-surface border border-line rounded-[11px] px-3.5 py-2.5 text-[13px]">
              <span className="truncate flex-1">{r.topic}</span>
              <span className="flex gap-1.5 shrink-0">
                <button onClick={() => decide(r.run_id, "accept")} className="h-7 px-2.5 rounded-[8px] text-[12px] font-medium bg-good/12 text-good hover:bg-good/20"><i className="ti ti-check mr-1" aria-hidden="true"></i>принять</button>
                <button onClick={() => decide(r.run_id, "rework")} className="h-7 px-2.5 rounded-[8px] text-[12px] font-medium bg-bg2 text-muted hover:text-amber"><i className="ti ti-rotate mr-1" aria-hidden="true"></i>доработать</button>
              </span>
            </div>
          ))}
        </div>
        <div className="text-[12.5px] text-faint mt-3 leading-relaxed">Дубль кнопок в VK Workspace бот (согласование прямо в мессенджере) — Фаза 3.</div>
      </Card>
    </>
  );
}

const FIELDS: any = { backend: ["echo", "openai"], profile: ["economy", "standard", "full"] };
export function Settings({ onSaved }: any) {
  const [s, setS] = useState<any>(null);
  const [act, setAct] = useState<any[]>([]);
  const [saved, setSaved] = useState(false);
  const load = () => { json("/api/settings").then(setS); json("/api/activity").then((d) => setAct(Array.isArray(d) ? d : [])); };
  useEffect(() => { load(); }, []);
  const save = async (patch: any) => { const ns = { ...s, ...patch }; setS(ns); await post("/api/settings", patch); setSaved(true); setTimeout(() => setSaved(false), 1500); onSaved && onSaved(); };
  if (!s) return <Card title="Настройки" icon="ti-settings"><div className="text-faint text-[13px]">загрузка…</div></Card>;
  const realWarn = s.backend === "openai" && s.autopilot_enabled;
  return (
    <>
      <Card title="Настройки платформы" icon="ti-settings" sub="применяются без перезапуска; действуют на прогоны и автопилот">
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <div className="text-[13px] text-muted mb-1.5">шлюз LLM</div>
            <select value={s.backend} onChange={(e) => save({ backend: e.target.value })} className="w-full h-10 border border-line bg-surface rounded-[11px] px-3 text-[14px]">
              <option value="echo">echo — офлайн-демо (бесплатно)</option>
              <option value="openai">AITunnel — реальный шлюз (тратит баланс)</option>
            </select>
          </label>
          <label className="block">
            <div className="text-[13px] text-muted mb-1.5">профиль исполнения</div>
            <select value={s.profile} onChange={(e) => save({ profile: e.target.value })} className="w-full h-10 border border-line bg-surface rounded-[11px] px-3 text-[14px]">
              <option value="economy">economy — дешёвые модели</option>
              <option value="standard">standard — Sonnet</option>
              <option value="full">full — Opus везде</option>
            </select>
          </label>
        </div>
        <div className="flex flex-col gap-2.5 mt-4">
          <label className="flex items-center justify-between bg-surface border border-line rounded-[11px] px-3.5 py-3 cursor-pointer">
            <span className="text-[13.5px]"><i className="ti ti-robot mr-2 text-purple" aria-hidden="true"></i>автопилот — планировщик сам берёт одобренные идеи и генерит</span>
            <input type="checkbox" checked={!!s.autopilot_enabled} onChange={(e) => save({ autopilot_enabled: e.target.checked })} className="w-5 h-5 accent-teal" />
          </label>
          <label className="flex items-center justify-between bg-surface border border-line rounded-[11px] px-3.5 py-3 cursor-pointer">
            <span className="text-[13.5px]"><i className="ti ti-checkup mr-2 text-teal" aria-hidden="true"></i>ревью — готовый черновик уходит на вычитку (принять/доработать)</span>
            <input type="checkbox" checked={!!s.review_required} onChange={(e) => save({ review_required: e.target.checked })} className="w-5 h-5 accent-teal" />
          </label>
        </div>
        {realWarn && <div className="mt-3 text-[13px] rounded-[10px] px-3.5 py-2.5" style={{ background: "rgba(217,138,22,.1)", color: "#9a6410" }}><i className="ti ti-alert-triangle mr-1.5" aria-hidden="true"></i>автопилот + реальный шлюз: фабрика будет тратить триал-баланс сама по расписанию.</div>}
        {saved && <div className="mt-3 text-[13px] text-good"><i className="ti ti-check mr-1" aria-hidden="true"></i>сохранено</div>}
      </Card>
      <Card title="Журнал активности" icon="ti-list-details" sub="что происходило на платформе" className="mt-4">
        <div className="flex flex-col gap-1.5 max-h-[320px] overflow-auto">
          {!act.length && <div className="text-[13px] text-faint py-1">пусто</div>}
          {act.map((a, i) => (
            <div key={i} className="flex items-center gap-3 text-[12.5px] py-1.5 border-b border-line last:border-0">
              <span className="text-faint font-mono whitespace-nowrap">{a.ts}</span>
              <span className="font-medium text-purple whitespace-nowrap">{a.action}</span>
              <span className="text-muted truncate">{a.detail}</span>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}
