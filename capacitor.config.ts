import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.stack.play",
  appName: "Stack",
  webDir: "dist-ios",
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    scheme: "Stack",
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: "#0c0d10",
      showSpinner: false,
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0c0d10",
    },
  },
};

export default config;
