import { useMemo } from "react";
import ReactFlow, { Background, Handle, Position } from "reactflow";
import { motion } from "framer-motion";
import { STAGES } from "./api";
import type { StageStatus } from "./api";

function AgentNode({ data }: any) {
  const st: StageStatus = data.status;
  const done = st === "done";
  const active = st === "active";
  const skip = st === "skip";
  const boxStyle: any = done
    ? { background: "linear-gradient(135deg,#0FB39A,#6D5AE6)", color: "#fff", border: "none" }
    : active
    ? { background: "#fff", color: "#0FB39A", border: "1px solid #0FB39A" }
    : { background: "#FDFBF6", color: "#9C9385", border: skip ? "1px dashed #E7DFD0" : "1px solid #E7DFD0" };
  return (
    <div onClick={data.onSelect} style={{ cursor: "pointer", textAlign: "center", width: 78 }}>
      <Handle type="target" position={Position.Left} />
      <motion.div
        className={active ? "node-active" : ""}
        animate={{ scale: active ? 1.06 : 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 16 }}
        style={{
          width: 58, height: 58, borderRadius: 17, margin: "0 auto",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 25, ...boxStyle,
          outline: data.selected ? "2px solid #6D5AE6" : "none", outlineOffset: 3,
          boxShadow: done ? "0 6px 16px rgba(15,179,154,.28)" : undefined,
        }}
      >
        <i className={"ti " + data.icon} aria-hidden="true"></i>
      </motion.div>
      <div style={{ fontSize: 12.5, marginTop: 8, color: done || active ? "#211D16" : "#726A5B", fontWeight: done || active ? 500 : 400 }}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { agent: AgentNode };

export default function Pipeline({ stages, selected, onSelect }: any) {
  const nodes = useMemo(
    () => STAGES.map((s, i) => ({
      id: s.id, type: "agent", position: { x: i * 180, y: 0 }, draggable: false,
      data: { ...s, status: stages[s.id] || "pending", selected: selected === s.id, onSelect: () => onSelect(s.id) },
    })),
    [stages, selected]
  );
  const edges = useMemo(
    () => STAGES.slice(0, -1).map((s, i) => {
      const from = s.id, to = STAGES[i + 1].id;
      const fs = stages[from], ts = stages[to];
      const doneEdge = (fs === "done" || fs === "skip") && (ts === "done" || ts === "skip");
      const activeEdge = (fs === "done" || fs === "skip") && ts === "active";
      return { id: from + "-" + to, source: from, target: to, animated: activeEdge, className: doneEdge ? "done" : activeEdge ? "animated" : "" };
    }),
    [stages]
  );
  return (
    <div style={{ height: 168 }}>
      <svg width="0" height="0" style={{ position: "absolute" }}>
        <defs>
          <linearGradient id="edgegrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0FB39A" /><stop offset="100%" stopColor="#6D5AE6" />
          </linearGradient>
        </defs>
      </svg>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.18 }}
        nodesDraggable={false} nodesConnectable={false} elementsSelectable={false}
        panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}
        panOnScroll={false} preventScrolling={false} proOptions={{ hideAttribution: true }}
      >
        <Background color="#E7DFD0" gap={22} size={1} />
      </ReactFlow>
    </div>
  );
}
