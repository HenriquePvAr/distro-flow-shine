import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// =======================
// DEBUG ANTI-TELA-BRANCA
// =======================
function showFatal(msg: string) {
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
    // sem fallback
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

// =======================
// PASSO 5 (LOGS IMPORTANTES)
// =======================
function logEnv() {
  const href = window.location.href;

  // se Capacitor existir, mostra info do ambiente
  const cap = (window as any).Capacitor;
  const isNative = !!cap?.isNativePlatform?.() || !!cap?.getPlatform?.();

  console.log("[BOOT] main.tsx carregou", new Date().toISOString());
  console.log("[URL]", href);
  console.log("[ONLINE?]", navigator.onLine);
  console.log("[USER_AGENT]", navigator.userAgent);
  console.log("[CAPACITOR EXISTS?]", !!cap);
  console.log("[CAPACITOR IS_NATIVE?]", isNative);
  if (cap?.getPlatform) console.log("[CAPACITOR PLATFORM]", cap.getPlatform());
}

logEnv();

window.addEventListener("online", () => {
  console.log("[NET] ONLINE event fired", new Date().toISOString());
  console.log("[ONLINE?]", navigator.onLine);
});

window.addEventListener("offline", () => {
  console.log("[NET] OFFLINE event fired", new Date().toISOString());
  console.log("[ONLINE?]", navigator.onLine);
});

// =======================
// START APP
// =======================
const rootEl = document.getElementById("root");
if (!rootEl) {
  showFatal("Elemento #root não encontrado no index.html");
} else {
  createRoot(rootEl).render(<App />);
}
