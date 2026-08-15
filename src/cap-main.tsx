import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { TetrisApp } from "@/components/tetris-app";
import "@/styles.css";

async function bootNative() {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const [{ StatusBar, Style }, { SplashScreen }] = await Promise.all([
      import("@capacitor/status-bar"),
      import("@capacitor/splash-screen"),
    ]);
    await StatusBar.setStyle({ style: Style.Dark });
    await SplashScreen.hide();
  } catch {
    /* web preview */
  }
}

void bootNative();

const root = document.getElementById("app");
if (!root) throw new Error("missing #app");

createRoot(root).render(
  <StrictMode>
    <TetrisApp />
  </StrictMode>,
);
