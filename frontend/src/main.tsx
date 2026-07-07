import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import "reactflow/dist/style.css";

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
