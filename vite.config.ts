import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    // ✅ garante paths corretos no deploy (Vercel / Capacitor / SPA)
    base: "/",

    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },

    plugins: [react(), isDev && componentTagger()].filter(Boolean),

    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },

    // ✅ build mais estável (principalmente em WebView/Android)
    build: {
      target: "es2018",
      sourcemap: isDev,
      // evita algumas tretas de preload em webview
      modulePreload: {
        polyfill: false,
      },
    },

    // ✅ em preview/proxy, ajuda a evitar comportamento estranho
    preview: {
      port: 8080,
    },
  };
});
