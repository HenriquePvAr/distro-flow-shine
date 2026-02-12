import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    /**
     * ✅ FUNDAMENTAL para Capacitor (file://)
     * - Garante que assets sejam carregados com caminho relativo
     * - Evita tela branca ao reabrir o app em uma rota diferente
     *
     * Obs: No Vercel também funciona ok.
     */
    base: "./",

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

    // ✅ build mais estável em WebView/Android
    build: {
      target: "es2018",
      sourcemap: isDev,

      // evita tretas de preload em webview
      modulePreload: {
        polyfill: false,
      },
    },

    preview: {
      port: 8080,
    },
  };
});
