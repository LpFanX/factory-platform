import { useCallback, useRef, useState } from "react";

export const STAGES = [
  { id: "seo-researcher", label: "Исследователь", icon: "ti-search" },
  { id: "seo-writer", label: "Автор", icon: "ti-pencil" },
  { id: "content-editor", label: "Редактор", icon: "ti-scale" },
  { id: "seo-fact-checker", label: "Факт-чек", icon: "ti-shield-check" },
  { id: "final-trust-editor", label: "Финал", icon: "ti-wand" },
];
const IDS = STAGES.map((s) => s.id);
const authFail = () => window.dispatchEvent(new Event("factory:auth"));
export const json = (u: string) => fetch(u).then((r) => {
  if (r.status === 401) { authFail(); throw new Error("unauthorized"); }
  return r.json();
});
export const post = (u: string, body?: any) =>
  fetch(u, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) })
    .then((r) => {
      if (r.status === 401) { authFail(); throw new Error("unauthorized"); }
      return r.json();
    }).catch(() => ({}));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type StageStatus = "pending" | "active" | "done" | "skip";
export interface LogLine { line: string; stage?: string; status?: string; }

export function useRun() {
  const [status, setStatus] = useState<"idle" | "running" | "gate" | "done" | "error">("idle");
  const [stages, setStages] = useState<Record<string, StageStatus>>({});
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [chars, setChars] = useState(0);
  const [result, setResult] = useState<any>(null);
  const [metrics, setMetrics] = useState<Record<string, any>>({});
  const [cost, setCost] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);
  const [topic, setTopic] = useState("Как выбрать облачную СУБД: PostgreSQL vs Tarantool");

  const ws = useRef<WebSocket | null>(null);
  const timer = useRef<any>(null);
  const queue = useRef<any[]>([]);
  const playing = useRef(false);
  const gate = useRef<null | (() => void)>(null);

  const reset = () => {
    setStages(Object.fromEntries(IDS.map((id) => [id, "pending"])) as any);
    setLogs([]); setElapsed(0); setChars(0); setResult(null); setMetrics({}); setCost(0);
  };

  const approve = useCallback(() => { if (gate.current) { gate.current(); gate.current = null; } }, []);

  const handle = async (ev: any) => {
    if (ev.type === "start") {
      setStages(Object.fromEntries(IDS.map((id, i) => [id, i === 0 ? "active" : "pending"])) as any);
    } else if (ev.type === "stage") {
      const line = ev.line || `[${ev.status}] ${ev.stage}: ${ev.detail || ""}`;
      setLogs((l) => [...l, { line, stage: ev.stage, status: ev.status }]);
      const m = String(ev.detail || "").match(/(\d[\d\s]*)\s*символ/);
      if (m) setChars(parseInt(m[1].replace(/\s/g, "")) || 0);
      const known = IDS.includes(ev.stage);
      if (ev.status === "completed" || ev.status === "applied") {
        if (known) {
          setStages((s) => {
            const n = { ...s, [ev.stage]: "done" as StageStatus };
            const nx = IDS[IDS.indexOf(ev.stage) + 1];
            if (nx && n[nx] === "pending") n[nx] = "active";
            return n;
          });
        }
        if (ev.stage === "content-editor") {
          setStatus("gate");
          await new Promise<void>((res) => { gate.current = res; setTimeout(() => { if (gate.current) { gate.current(); gate.current = null; } }, 9000); });
          setStatus("running");
        }
      } else if (ev.status === "skipped") {
        if (known) setStages((s) => ({ ...s, [ev.stage]: "skip" }));
      } else if (ev.status === "started" || ev.status === "running") {
        if (known) setStages((s) => ({ ...s, [ev.stage]: "active" }));
      }
    } else if (ev.type === "done") {
      setStages((s) => { const n = { ...s }; IDS.forEach((id) => { if (n[id] !== "skip") n[id] = "done"; }); return n; });
      setResult(ev.result); setStatus("done"); clearInterval(timer.current);
      const m: Record<string, any> = {};
      (ev.result?.stage_metrics || []).forEach((s: any) => { m[s.stage] = s; });
      setMetrics(m);
      if (ev.result?.cost_rub != null) setCost(ev.result.cost_rub);
      if (ev.result?.balance != null) setBalance(ev.result.balance);
    } else if (ev.type === "error") {
      setLogs((l) => [...l, { line: "ОШИБКА: " + ev.message }]); setStatus("error"); clearInterval(timer.current);
    }
  };

  const playLoop = async () => {
    if (playing.current) return;
    playing.current = true;
    while (queue.current.length) {
      const ev = queue.current.shift();
      await handle(ev);
      await sleep(ev.type === "stage" ? 360 : 120);
    }
    playing.current = false;
  };

  const start = useCallback((backend: string) => {
    if (status === "running" || status === "gate") return;
    reset(); setStatus("running");
    const t0 = Date.now();
    timer.current = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 500);
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const sock = new WebSocket(`${proto}://${location.host}/api/runs/ws`);
    ws.current = sock;
    sock.onopen = () => sock.send(JSON.stringify({ workflow: "seo-article", topic, backend }));
    sock.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "log") setLogs((l) => [...l, { line: d.line }]);
      else { queue.current.push(d); playLoop(); }
    };
    sock.onerror = () => { queue.current.push({ type: "error", message: "нет связи с сервером" }); playLoop(); };
    sock.onclose = (e) => { if (e.code === 4401 || e.code === 1008) window.dispatchEvent(new Event("factory:auth")); };
  }, [status, topic]);

  return { status, stages, logs, elapsed, chars, result, metrics, cost, balance, topic, setTopic, start, approve };
}
