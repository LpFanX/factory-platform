import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRun, json, STAGES } from "./api";
import Pipeline from "./Pipeline";
import { Header, Metrics, AgentPanel, IdeaBank, RunsHistory, Card, Login } from "./ui";
import { ScheduleControls, RunsView, ApprovalsView, Settings, BudgetView, Logs } from "./views";

const fmtT = (s: number) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const progressPct = (stages: any) => {
  const total = STAGES.length;
  const done = STAGES.filter((s) => stages[s.id] === "done" || stages[s.id] === "skip").length;
  return Math.round((done / total) * 100);
};
function stageTxt(run: any) {
  if (run.status === "done") return "готово · " + (run.result?.completeness || "") + " · черновик сохранён";
  if (run.status === "idle") return "—";
  const active = STAGES.find((s) => run.stages[s.id] === "active");
  return active ? active.label + " — работает" : "запуск…";
}
const PILL: any = {
  idle: ["ожидание", "bg-bg2 text-muted"], running: ["выполняется", "bg-amber/15 text-amber"],
  gate: ["на согласовании", "bg-amber/15 text-amber"], done: ["завершено", "bg-good/15 text-good"],
  error: ["ошибка", "bg-danger/15 text-danger"],
};
const TABS = [
  { id: "dashboard", label: "Дашборд", icon: "ti-layout-dashboard", path: "/" },
  { id: "runs", label: "Прогоны", icon: "ti-history", path: "/runs" },
  { id: "budget", label: "Расходы", icon: "ti-coins", path: "/budget" },
  { id: "approvals", label: "Согласования", icon: "ti-checkup", path: "/approvals" },
  { id: "settings", label: "Настройки", icon: "ti-settings", path: "/settings" },
  { id: "logs", label: "Logs", icon: "ti-list-details", path: "/logs" },
];
const normPath = (p: string) => { const q = (p || "/").replace(/\/+$/, ""); return q === "" ? "/" : q; };
const pathToView = (p: string) => (TABS.find((t) => t.path === normPath(p)) || TABS[0]).id;

export default function App() {
  const run = useRun();
  const [engine, setEngine] = useState<any>({});
  const [ideas, setIdeas] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({ backend: "echo" });
  const [aiBalance, setAiBalance] = useState<number | null>(null);
  const [aiStats, setAiStats] = useState<any>({});
  const [selected, setSelected] = useState(STAGES[0].id);
  const [backend, setBackend] = useState("echo");
  const [view, setView] = useState<string>(() => pathToView(window.location.pathname));
  const [needLogin, setNeedLogin] = useState(false);
  const [authOn, setAuthOn] = useState(false);

  const refresh = () => {
    json("/api/health").then((d) => setAuthOn(!!d.auth)).catch(() => {});
    json("/api/engine").then(setEngine).catch(() => {});
    json("/api/ideas").then((d) => setIdeas(Array.isArray(d) ? d : [])).catch(() => {});
    json("/api/runs").then((d) => setRuns(Array.isArray(d) ? d : [])).catch(() => {});
    json("/api/settings").then((s) => { setSettings(s); setBackend(s.backend || "echo"); }).catch(() => {});
    json("/api/aitunnel/balance").then((d) => setAiBalance(typeof d?.balance === "number" ? d.balance : null)).catch(() => {});
    json("/api/aitunnel/stats").then(setAiStats).catch(() => {});
  };
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (run.status === "done") refresh(); }, [run.status]);
  useEffect(() => {
    const on = () => setView(pathToView(window.location.pathname));
    const onAuth = () => setNeedLogin(true);
    window.addEventListener("popstate", on);
    window.addEventListener("factory:auth", onAuth);
    return () => { window.removeEventListener("popstate", on); window.removeEventListener("factory:auth", onAuth); };
  }, []);
  useEffect(() => {
    const t = TABS.find((x) => x.id === view);
    document.title = t && t.id !== "dashboard" ? `${t.label} — Фабрика контента` : "Фабрика контента · VK Cloud";
  }, [view]);
  const navigate = (id: string) => {
    const t = TABS.find((x) => x.id === id); if (!t) return;
    if (normPath(window.location.pathname) !== t.path) window.history.pushState(null, "", t.path);
    setView(id);
  };

  if (needLogin) return <Login />;

  const today = new Date().toISOString().slice(0, 10);
  const runsToday = runs.filter((r) => (r.ts || "").startsWith(today)).length || runs.length;
  const doneRuns = runs.filter((r) => r.seconds);
  const avg = doneRuns.length ? fmtT(Math.round(doneRuns.reduce((a, r) => a + r.seconds, 0) / doneRuns.length)) : "—";
  const pill = PILL[run.status] || PILL.idle;
  const gatePending = run.status === "gate";
  const reviewCount = runs.filter((r) => r.status === "awaiting_review").length;

  return (
    <div className="max-w-[1160px] mx-auto px-5 pt-6 pb-16">
      <Header engine={engine} balance={aiBalance} authOn={authOn}
        lowBalance={aiBalance != null && settings.low_balance_rub != null && aiBalance < settings.low_balance_rub} />

      <nav className="sticky top-0 z-30 flex gap-1.5 mb-5 flex-wrap -mx-5 px-5 py-2.5 backdrop-blur-md"
        style={{ background: "rgba(246,241,232,.78)" }}>
        {TABS.map((t) => {
          const on = view === t.id;
          const badge = (t.id === "approvals" && (gatePending || reviewCount)) ? (gatePending ? "•" : reviewCount) : null;
          return (
            <button key={t.id} onClick={() => navigate(t.id)}
              className={"h-9 px-3.5 rounded-[10px] text-[13.5px] font-medium flex items-center gap-1.5 border transition-colors " + (on ? "border-transparent text-white" : "border-line bg-surface text-muted hover:text-ink")}
              style={on ? { background: "linear-gradient(135deg,#0FB39A,#6D5AE6)" } : undefined}>
              <i className={"ti " + t.icon} aria-hidden="true"></i>{t.label}
              {badge != null && <span className="ml-0.5 text-[11px] px-1.5 rounded-full" style={on ? { background: "rgba(255,255,255,.25)" } : { background: "rgba(217,138,22,.18)", color: "#9a6410" }}>{badge}</span>}
            </button>
          );
        })}
      </nav>

      <motion.div key={view} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: "easeOut" }}>
      {view === "dashboard" && (
        <>
          <Metrics runsToday={runsToday} avg={avg} ideas={ideas.length} todaySpend={aiStats.today_spend} />
          <div className="grid lg:grid-cols-[1.55fr_1fr] gap-4 items-start">
            <Card title="Конвейер агентов" icon="ti-route" sub="запусти прогон — стадии оживают в реальном времени; кликни агента для лога и метрик">
              <div className="flex gap-2.5 items-center mb-4 flex-wrap">
                <input value={run.topic} onChange={(e) => run.setTopic(e.target.value)}
                  className="flex-1 min-w-[200px] h-10 border border-line bg-surface rounded-[11px] px-3.5 text-[14px] text-ink outline-none focus:border-teal" placeholder="Тема статьи…" />
                <select value={backend} onChange={(e) => setBackend(e.target.value)}
                  className="h-10 border border-line bg-surface rounded-[11px] px-3 text-[13px] text-ink" title="реальный шлюз тратит триал-баланс">
                  <option value="echo">echo (демо)</option>
                  <option value="openai">AITunnel (реально)</option>
                </select>
                <button onClick={() => run.start(backend)} disabled={run.status === "running" || run.status === "gate"}
                  className="h-10 px-4 rounded-[11px] text-white font-medium text-[14px] flex items-center gap-1.5 disabled:opacity-50"
                  style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)", boxShadow: "0 6px 16px rgba(15,179,154,.3)" }}>
                  <i className="ti ti-player-play" aria-hidden="true"></i>Запустить
                </button>
                <span className={"text-[12.5px] px-3 py-1 rounded-full font-medium " + pill[1]}>{pill[0]}</span>
              </div>
              <div className="text-[13px] text-muted mb-1">тема: <b className="text-ink font-medium">{run.topic}</b> <span className="text-faint">· seo-article · {settings.profile || "standard"}</span></div>
              <Pipeline stages={run.stages} selected={selected} onSelect={setSelected} />
              <div className="h-[7px] bg-bg2 rounded-full overflow-hidden mt-1 mb-2.5">
                <div className="h-full rounded-full transition-all duration-500" style={{ width: progressPct(run.stages) + "%", background: "linear-gradient(90deg,#0FB39A,#6D5AE6)" }} />
              </div>
              <div className="flex justify-between text-[12.5px] text-muted">
                <span>{stageTxt(run)}</span>
                <span><i className="ti ti-clock" aria-hidden="true"></i> {fmtT(run.elapsed)} · <i className="ti ti-file-text" aria-hidden="true"></i> {run.chars ? run.chars.toLocaleString("ru") : 0} симв.</span>
              </div>
              {gatePending && (
                <div className="mt-4 border rounded-[12px] px-4 py-3" style={{ borderColor: "rgba(217,138,22,.4)", background: "rgba(217,138,22,.09)" }}>
                  <div className="flex items-center justify-between gap-2.5 flex-wrap">
                    <span className="text-[13px] text-amber"><i className="ti ti-hand-stop" aria-hidden="true"></i> черновик готов, оценка редактора получена — публиковать?</span>
                    <span className="flex gap-2">
                      <button onClick={run.approve} className="h-9 px-3.5 rounded-[10px] text-white text-[13px] font-medium flex items-center gap-1.5" style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)" }}><i className="ti ti-check" aria-hidden="true"></i>Принять</button>
                      <button onClick={run.approve} className="h-9 px-3.5 rounded-[10px] border border-line bg-surface text-[13px] flex items-center gap-1.5"><i className="ti ti-rotate" aria-hidden="true"></i>На доработку</button>
                    </span>
                  </div>
                </div>
              )}
            </Card>
            <AgentPanel selected={selected} stages={run.stages} logs={run.logs} metrics={run.metrics} />
          </div>
          <div className="grid lg:grid-cols-2 gap-4 mt-4">
            <IdeaBank ideas={ideas} onRefresh={refresh} />
            <RunsHistory runs={runs} />
          </div>
        </>
      )}

      {view === "runs" && <RunsView runs={runs} />}
      {view === "budget" && <BudgetView runs={runs} balance={aiBalance} stats={aiStats} settings={settings} />}
      {view === "approvals" && <ApprovalsView run={run} runs={runs} onRefresh={refresh} />}
      {view === "settings" && (<><Settings onSaved={refresh} /><div className="mt-4"><ScheduleControls /></div></>)}
      {view === "logs" && <Logs />}
      </motion.div>
    </div>
  );
}
