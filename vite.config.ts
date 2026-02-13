import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => {
  const isDev = mode === "development";

  return {
    /**
     * ✅ CORREÇÃO PARA TELA BRANCA (F5)
     * Usar "/" garante que os assets (JS/CSS) sejam sempre buscados
     * a partir da raiz do domínio, independente da rota que você esteja (ex: /pdv).
     * * Isso resolve o problema de carregar arquivos relativos em sub-rotas.
     */
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