import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// =======================
// DEBUG ANTI-TELA-BRANCA
// =======================
function showFatal(msg: string) {
  try {
    // evita duplicar overlay
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
    el.style.fontSize = "13px";
    el.style.lineHeight = "1.4";
    el.style.whiteSpace = "pre-wrap";
    el.style.overflow = "auto";

    el.innerText =
      "FATAL ERROR (tela branca)\n" +
      "========================\n\n" +
      msg +
      "\n\n" +
      "Dica: copie essa tela e me envie aqui.";

    document.body.appendChild(el);
  } catch {
    // se até isso falhar, não tem muito o que fazer
  }
}

window.addEventListener("error", (e) => {
  const msg =
    (e as any)?.error?.stack ||
    (e as any)?.message ||
    String(e);
  showFatal(msg);
});

window.addEventListener("unhandledrejection", (e: any) => {
  const msg = e?.reason?.stack || e?.reason || String(e);
  showFatal(msg);
});

// marca de vida (pra confirmar que o main carregou)
console.log("[BOOT] main.tsx carregou", new Date().toISOString());

// =======================
// START APP
// =======================
const rootEl = document.getElementById("root");
if (!rootEl) {
  showFatal("Elemento #root não encontrado no index.html");
} else {
  createRoot(rootEl).render(<App />);
}
