import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.henrique.distroflow",
  appName: "2G",
  webDir: "dist",

  android: {
    allowMixedContent: false,
  },

  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
