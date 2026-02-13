import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.henrique.distroflow",
  appName: "2G",
  webDir: "dist",

  server: {
    url: "https://distro-flow-shine.vercel.app",
    androidScheme: "https",
    cleartext: false,
    allowNavigation: [
      "distro-flow-shine.vercel.app",
      "*.vercel.app",
      "*.supabase.co"
    ]
  },

  android: {
    allowMixedContent: false
  }
};

export default config;
