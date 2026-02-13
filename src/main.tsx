import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const LOGS: string[] = [];
const MAX_LOGS = 200;

function pushLog(...args: any[]) {
  const line = args
    .map((a) => {
      try {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === "object") return JSON.stringify(a);
        return String(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
  LOGS.push(`[${new Date().toISOString()}] ${line}`);
  if (LOGS.length > MAX_LOGS) LOGS.shift();
}

const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;

console.log = (...a) => { pushLog("[LOG]", ...a); origLog(...a); };
console.error = (...a) => { pushLog("[ERR]", ...a); origErr(...a); };
console.warn = (...a) => { pushLog("[WRN]", ...a); origWarn(...a); };

function showFatal(title: string, err: any) {
  try {
    if (document.getElementById("__fatal_overlay__")) return;

    const el = document.createElement("div");
    el.id = "__fatal_overlay__";
    el.style.position = "fixed";
    el.style.zIndex = "999999";
    el.style.inset = "0";
    el.style.background = "#0b0b0b";
    el.style.color = "#ffffff";
    el.style.padding = "16px";
    el.style.fontFamily = "monospace";
    el.style.fontSize = "12px";
    el.style.lineHeight = "1.4";
    el.style.whiteSpace = "pre-wrap";
    el.style.overflow = "auto";

    const isCapacitor = !!(window as any).Capacitor;
    const stack =
      err?.stack ||
      err?.reason?.stack ||
      err?.error?.stack ||
      (typeof err === "string" ? err : JSON.stringify(err, null, 2));

    el.innerText =
      `FATAL ERROR (tela branca)\n` +
      `========================\n\n` +
      `TITLE: ${title}\n` +
      `URL: ${location.href}\n` +
      `CAPACITOR: ${isCapacitor}\n` +
      `UA: ${navigator.userAgent}\n\n` +
      `STACK:\n${stack}\n\n` +
      `LAST LOGS:\n${LOGS.join("\n")}\n\n` +
      `COPIE ESSA TELA E ME ENVIE.`;

    document.body.appendChild(el);
  } catch {
    // nada
  }
}

window.addEventListener("error", (e) => {
  showFatal("window.error", (e as any)?.error || e);
});

window.addEventListener("unhandledrejection", (e: any) => {
  showFatal("unhandledrejection", e?.reason || e);
});

console.log("[BOOT] main.tsx carregou", new Date().toISOString());

const rootEl = document.getElementById("root");
if (!rootEl) {
  showFatal("root-missing", "Elemento #root não encontrado no index.html");
} else {
  createRoot(rootEl).render(<App />);
}
