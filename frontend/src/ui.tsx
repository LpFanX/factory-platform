import { useState } from "react";
import { STAGES, post } from "./api";
import type { LogLine } from "./api";

export function Card({ title, icon, sub, children, className = "" }: any) {
  return (
    <div className={"bg-white border border-line rounded-[18px] shadow-soft p-5 " + className}>
      {title && (
        <div className="flex items-center gap-2 text-[15px] font-semibold">
          {icon && <i className={"ti " + icon + " text-teal"} aria-hidden="true"></i>}
          <span>{title}</span>
        </div>
      )}
      {sub && <div className="text-[12.5px] text-muted mt-0.5 mb-3.5">{sub}</div>}
      {children}
    </div>
  );
}

const RUN_STATUS: any = {
  awaiting_review: ["на ревью", "bg-amber/15 text-amber"],
  accepted: ["принят", "bg-good/15 text-good"],
  done: ["готово", "bg-good/15 text-good"],
  failed: ["ошибка", "bg-danger/12 text-danger"],
  reworked: ["доработка", "bg-purple/10 text-purple"],
};
export function StatusPill({ status, extra }: any) {
  const [label, cls] = RUN_STATUS[status] || [status || "—", "bg-bg2 text-muted"];
  return (
    <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap " + cls}>
      {label}{extra ? <span className="opacity-75"> · {extra}</span> : null}
    </span>
  );
}

export function Header({ engine, balance, authOn, lowBalance }: any) {
  const e = engine || {};
  const logout = async () => { await post("/api/logout"); location.reload(); };
  return (
    <header className="flex items-center justify-between gap-4 flex-wrap mb-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-[12px] flex items-center justify-center text-white text-[21px]"
             style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)", boxShadow: "0 6px 18px rgba(15,179,154,.32)" }}>
          <i className="ti ti-cpu" aria-hidden="true"></i>
        </div>
        <div>
          <div className="font-display text-[20px] font-semibold tracking-tight leading-none">Фабрика контента</div>
          <div className="text-[12.5px] text-muted mt-0.5">автономная генерация · VK Cloud</div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {balance != null && (
          <div className={"flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] border " + (lowBalance ? "border-danger/40 bg-danger/5" : "bg-surface border-line")}
               title={lowBalance ? "баланс AITunnel ниже порога — пополни" : "баланс AITunnel"}>
            <i className={"ti " + (lowBalance ? "ti-alert-triangle text-danger" : "ti-wallet text-teal")} aria-hidden="true"></i>
            <span className="text-muted">баланс</span>
            <b className={"font-semibold tabnum " + (lowBalance ? "text-danger" : "")}>{Math.round(balance).toLocaleString("ru")} ₽</b>
          </div>
        )}
        <div className="flex items-center gap-2 bg-surface border border-line rounded-full px-3.5 py-2 text-[12.5px]" title="версия движка агентов (обновляется с git)">
          <span className="w-2 h-2 rounded-full bg-good" style={{ boxShadow: "0 0 0 3px rgba(44,158,104,.18)" }}></span>
          <span className="text-muted">движок</span>
          <b className="font-semibold">v{e.version || "…"}</b>
          <span className="font-mono text-faint text-[12px]">{e.sha}</span>
          {e.pulled && <span className="text-faint">· обновлён {String(e.pulled).slice(11, 16)}</span>}
        </div>
        <a href="/how.html" title="как работает фабрика — интерактивная схема"
          className="w-9 h-9 rounded-full border border-line bg-surface text-muted hover:text-teal flex items-center justify-center">
          <i className="ti ti-route" aria-hidden="true"></i>
        </a>
        {authOn && (
          <button onClick={logout} title="выйти из панели"
            className="w-9 h-9 rounded-full border border-line bg-surface text-muted hover:text-danger flex items-center justify-center">
            <i className="ti ti-logout" aria-hidden="true"></i>
          </button>
        )}
      </div>
    </header>
  );
}

export function Login() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (!pw || busy) return;
    setBusy(true); setErr(false);
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password: pw }) });
    if (r.ok) location.reload(); else { setErr(true); setBusy(false); }
  };
  return (
    <div className="min-h-screen flex items-center justify-center px-5">
      <div className="bg-white border border-line rounded-[20px] shadow-soft p-8 w-full max-w-[380px]">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-[14px] flex items-center justify-center text-white text-[24px] mb-3"
               style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)", boxShadow: "0 8px 22px rgba(15,179,154,.35)" }}>
            <i className="ti ti-cpu" aria-hidden="true"></i>
          </div>
          <div className="font-display text-[20px] font-semibold tracking-tight">Фабрика контента</div>
          <div className="text-[12.5px] text-muted mt-1">вход в панель управления</div>
        </div>
        <input type="password" value={pw} autoFocus onChange={(e) => { setPw(e.target.value); setErr(false); }}
          onKeyDown={(e) => e.key === "Enter" && go()} placeholder="Пароль"
          className={"w-full h-11 border rounded-[12px] px-3.5 text-[14px] outline-none bg-surface " + (err ? "border-danger" : "border-line focus:border-teal")} />
        {err && <div className="text-[12.5px] text-danger mt-2"><i className="ti ti-alert-circle mr-1" aria-hidden="true"></i>неверный пароль</div>}
        <button onClick={go} disabled={busy || !pw}
          className="w-full h-11 mt-4 rounded-[12px] text-white font-medium text-[14px] flex items-center justify-center gap-1.5 disabled:opacity-50"
          style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)", boxShadow: "0 6px 16px rgba(15,179,154,.3)" }}>
          <i className={"ti " + (busy ? "ti-loader-2 animate-spin" : "ti-login-2")} aria-hidden="true"></i>{busy ? "проверяю…" : "Войти"}
        </button>
      </div>
    </div>
  );
}

function Metric({ icon, k, v }: any) {
  return (
    <div className="bg-surface border border-line rounded-[14px] px-4 py-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-soft hover:border-teal/40">
      <div className="text-[12.5px] text-muted flex items-center gap-1.5"><i className={"ti " + icon + " text-teal"} aria-hidden="true"></i>{k}</div>
      <div className="text-[27px] font-semibold tracking-tight mt-0.5 tabnum">{v}</div>
    </div>
  );
}
export function Metrics({ runsToday, avg, ideas, todaySpend }: any) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
      <Metric icon="ti-checklist" k="прогонов сегодня" v={runsToday} />
      <Metric icon="ti-clock" k="среднее время" v={avg} />
      <Metric icon="ti-bulb" k="в очереди идей" v={ideas} />
      <Metric icon="ti-coins" k="расход сегодня" v={<>{Math.round(todaySpend || 0).toLocaleString("ru")} <small>₽</small></>} />
    </div>
  );
}

export function AgentPanel({ selected, stages, logs, metrics }: { selected: string; stages: any; logs: LogLine[]; metrics?: any }) {
  const meta = STAGES.find((s) => s.id === selected);
  const st = stages[selected];
  const stTxt = st === "done" ? "готово" : st === "active" ? "работает" : st === "skip" ? "пропущен" : "ожидание";
  const rows = logs.filter((l) => !selected || l.stage === selected || !l.stage);
  const m = (metrics || {})[selected] || {};
  const toks = (m.in != null || m.out != null) ? `${(m.in || 0).toLocaleString("ru")} → ${(m.out || 0).toLocaleString("ru")}` : "—";
  return (
    <Card>
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <i className="ti ti-terminal-2 text-purple" aria-hidden="true"></i>
        <span>{meta ? meta.label : "Агент"}</span>
      </div>
      <div className="text-[12.5px] text-muted mb-3">{m.model ? <>модель <span className="font-mono">{m.model}</span></> : (meta ? "стадия · " + meta.id : "кликни узел конвейера")}</div>
      <div className="grid grid-cols-3 gap-2.5 mb-3.5">
        <div className="bg-surface border border-line rounded-[11px] px-3 py-2"><div className="text-[11.5px] text-faint">статус</div><div className="text-[15px] font-semibold mt-0.5">{stTxt}</div></div>
        <div className="bg-surface border border-line rounded-[11px] px-3 py-2"><div className="text-[11.5px] text-faint">токены in→out</div><div className="text-[13px] font-semibold font-mono mt-0.5">{toks}</div></div>
        <div className="bg-surface border border-line rounded-[11px] px-3 py-2"><div className="text-[11.5px] text-faint">стоимость</div><div className="text-[15px] font-semibold mt-0.5">{m.cost_rub ? m.cost_rub + " ₽" : "—"}</div></div>
      </div>
      <div className="logbox rounded-[12px] p-3.5 h-[250px] overflow-auto font-mono text-[12px] leading-[1.65]" style={{ background: "#1c1a15", color: "#d7cfbf" }}>
        {rows.length ? rows.map((l, i) => {
          const c = l.status === "completed" || l.status === "applied" ? "#5fd0b6" : l.status === "started" || l.status === "running" ? "#e3b562" : "#8f867a";
          return <div key={i} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}><span style={{ color: c }}>{l.line}</span></div>;
        }) : <div style={{ color: "#8f867a" }}>— лог появится во время прогона —</div>}
      </div>
    </Card>
  );
}

const tagClass: any = {
  proposed: "bg-bg2 text-muted", approved: "bg-purple/10 text-purple",
  done: "bg-good/15 text-good", rejected: "bg-danger/12 text-danger", queued: "bg-purple/10 text-purple",
};
export function IdeaBank({ ideas, onRefresh }: any) {
  const [topic, setTopic] = useState("");
  const [busy, setBusy] = useState(false);
  const add = async () => {
    const t = topic.trim(); if (!t) return;
    setBusy(true); await post("/api/ideas", { topic: t }); setTopic(""); setBusy(false); onRefresh && onRefresh();
  };
  const act = async (id: string, action: string) => { await post(`/api/ideas/${id}/${action}`); onRefresh && onRefresh(); };
  return (
    <Card title="Банк идей" icon="ti-inbox" sub="единая очередь тем — источник для планировщика">
      <div className="flex gap-2 mb-3">
        <input value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()}
          className="flex-1 min-w-0 h-9 border border-line bg-surface rounded-[10px] px-3 text-[13.5px] text-ink outline-none focus:border-teal" placeholder="Новая тема…" />
        <button onClick={add} disabled={busy || !topic.trim()} className="h-9 px-3 rounded-[10px] text-white text-[13px] font-medium flex items-center gap-1.5 disabled:opacity-50" style={{ background: "linear-gradient(135deg,#0FB39A,#6D5AE6)" }}>
          <i className="ti ti-plus" aria-hidden="true"></i>Добавить
        </button>
      </div>
      <div className="flex flex-col gap-2.5">
        {(!ideas || !ideas.length) && <div className="text-[13px] text-faint py-1">банк пуст — добавь тему выше</div>}
        {(ideas || []).slice(0, 10).map((it: any, i: number) => {
          const t = it.topic || it.title || String(it).slice(0, 60);
          const s = it.status || "proposed";
          return (
            <div key={i} className="flex items-center justify-between gap-2.5 bg-surface border border-line rounded-[11px] px-3.5 py-2.5 text-[13px]">
              <span className="truncate flex-1">{t}</span>
              {s === "proposed" ? (
                <span className="flex gap-1.5 shrink-0">
                  <button onClick={() => act(it.id, "approve")} className="h-7 px-2.5 rounded-[8px] text-[12px] font-medium bg-good/12 text-good hover:bg-good/20" title="одобрить"><i className="ti ti-check" aria-hidden="true"></i></button>
                  <button onClick={() => act(it.id, "reject")} className="h-7 px-2.5 rounded-[8px] text-[12px] font-medium bg-bg2 text-muted hover:text-danger" title="отклонить"><i className="ti ti-x" aria-hidden="true"></i></button>
                </span>
              ) : (
                <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap " + (tagClass[s] || tagClass.proposed)}>{s}</span>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

export function RunsHistory({ runs }: any) {
  const fmtT = (s: number) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  return (
    <Card title="Последние прогоны" icon="ti-history" sub="история фабрики">
      <div className="flex flex-col gap-2.5">
        {(!runs || !runs.length) && <div className="text-[13px] text-faint py-2"><i className="ti ti-mist mr-1.5" aria-hidden="true"></i>пока нет прогонов</div>}
        {(runs || []).slice(0, 7).map((r: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-2.5 bg-surface border border-line rounded-[11px] px-3.5 py-2.5 text-[13px] transition-colors hover:border-teal/50">
            <span className="truncate">{r.topic || r.workflow}</span>
            <span className="flex items-center gap-2 shrink-0">
              {(r.cost || 0) > 0 && <span className="text-[11.5px] text-faint font-mono tabnum">{Number(r.cost).toLocaleString("ru", { maximumFractionDigits: 1 })} ₽</span>}
              <StatusPill status={r.status} extra={fmtT(r.seconds || 0)} />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
