import { STAGES } from "./api";
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

export function Header({ engine }: any) {
  const e = engine || {};
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
      <div className="flex items-center gap-2 bg-surface border border-line rounded-full px-3.5 py-2 text-[12.5px]" title="версия движка агентов (обновляется с git)">
        <span className="w-2 h-2 rounded-full bg-good" style={{ boxShadow: "0 0 0 3px rgba(44,158,104,.18)" }}></span>
        <span className="text-muted">движок</span>
        <b className="font-semibold">v{e.version || "…"}</b>
        <span className="font-mono text-faint text-[12px]">{e.sha}</span>
        {e.pulled && <span className="text-faint">· обновлён {String(e.pulled).slice(11, 16)}</span>}
      </div>
    </header>
  );
}

function Metric({ icon, k, v }: any) {
  return (
    <div className="bg-surface border border-line rounded-[14px] px-4 py-3.5">
      <div className="text-[12.5px] text-muted flex items-center gap-1.5"><i className={"ti " + icon} aria-hidden="true"></i>{k}</div>
      <div className="text-[27px] font-semibold tracking-tight mt-0.5">{v}</div>
    </div>
  );
}
export function Metrics({ runsToday, avg, ideas, backend }: any) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-5">
      <Metric icon="ti-checklist" k="прогонов сегодня" v={runsToday} />
      <Metric icon="ti-clock" k="среднее время" v={avg} />
      <Metric icon="ti-bulb" k="в очереди идей" v={ideas} />
      <Metric icon="ti-plug-connected" k="шлюз" v={backend} />
    </div>
  );
}

const fmtT = (s: number) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");

export function AgentPanel({ selected, stages, logs, chars }: { selected: string; stages: any; logs: LogLine[]; chars: number }) {
  const meta = STAGES.find((s) => s.id === selected);
  const st = stages[selected];
  const stTxt = st === "done" ? "готово" : st === "active" ? "работает" : st === "skip" ? "пропущен" : "ожидание";
  const rows = logs.filter((l) => !selected || l.stage === selected || !l.stage);
  return (
    <Card>
      <div className="flex items-center gap-2 text-[14px] font-semibold">
        <i className="ti ti-terminal-2 text-purple" aria-hidden="true"></i>
        <span>{meta ? meta.label : "Агент"}</span>
      </div>
      <div className="text-[12.5px] text-muted mb-3">{meta ? "стадия конвейера · " + meta.id : "кликни узел конвейера"}</div>
      <div className="grid grid-cols-2 gap-2.5 mb-3.5">
        <div className="bg-surface border border-line rounded-[11px] px-3 py-2">
          <div className="text-[11.5px] text-faint">статус</div>
          <div className="text-[16px] font-semibold mt-0.5">{stTxt}</div>
        </div>
        <div className="bg-surface border border-line rounded-[11px] px-3 py-2">
          <div className="text-[11.5px] text-faint">символов</div>
          <div className="text-[16px] font-semibold font-mono mt-0.5">{chars ? chars.toLocaleString("ru") : "—"}</div>
        </div>
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
  done: "bg-good/15 text-good", running: "bg-amber/15 text-amber", queued: "bg-purple/10 text-purple",
};
export function IdeaBank({ ideas }: any) {
  return (
    <Card title="Банк идей" icon="ti-inbox" sub="единая очередь тем — источник для планировщика">
      <div className="flex flex-col gap-2.5">
        {(!ideas || !ideas.length) && <div className="text-[13px] text-faint py-2">банк пуст — темы добавим на этапе автономной фабрики</div>}
        {(ideas || []).slice(0, 7).map((it: any, i: number) => {
          const t = it.topic || it.title || it.name || String(it).slice(0, 60);
          const s = it.status || "proposed";
          return (
            <div key={i} className="flex items-center justify-between gap-2.5 bg-surface border border-line rounded-[11px] px-3.5 py-2.5 text-[13px]">
              <span className="truncate">{t}</span>
              <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap " + (tagClass[s] || tagClass.proposed)}>{s}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
export function RunsHistory({ runs }: any) {
  return (
    <Card title="Последние прогоны" icon="ti-history" sub="история фабрики">
      <div className="flex flex-col gap-2.5">
        {(!runs || !runs.length) && <div className="text-[13px] text-faint py-2">пока нет прогонов</div>}
        {(runs || []).slice(0, 7).map((r: any, i: number) => (
          <div key={i} className="flex items-center justify-between gap-2.5 bg-surface border border-line rounded-[11px] px-3.5 py-2.5 text-[13px]">
            <span className="truncate">{r.topic || r.workflow}</span>
            <span className={"text-[11.5px] px-2.5 py-1 rounded-full font-medium whitespace-nowrap " + (r.ready ? tagClass.done : tagClass.proposed)}>
              {(r.completeness || "—") + " · " + fmtT(r.seconds || 0)}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
