import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.henrique.distroflow",
  appName: "2G",
  webDir: "dist",
  bundledWebRuntime: false,

  server: {
    url: "https://distro-flow-shine.vercel.app",
    cleartext: false,
    androidScheme: "https",
  },

  android: {
    allowMixedContent: false,
  },
};

export default config;
