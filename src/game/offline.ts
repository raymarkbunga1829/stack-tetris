/** Register the offline shell. Fail quiet. Never swap mid-run. */

function shellUrls(): string[] {
  const urls = new Set<string>(["/", window.location.pathname || "/"]);
  document.querySelectorAll("script[src], link[rel='stylesheet'], link[rel='icon']").forEach((el) => {
    const href = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href;
    if (href && href.startsWith(window.location.origin)) urls.add(href);
  });
  return [...urls];
}

export function registerOffline(canReload: () => boolean): () => void {
  if (typeof window === "undefined") return () => {};
  if (!("serviceWorker" in navigator)) return () => {};
  if (!import.meta.env.PROD) return () => {};

  let asked = false;
  let cancelled = false;

  const trySwap = (reg: ServiceWorkerRegistration) => {
    if (cancelled || !reg.waiting || !navigator.onLine || !canReload()) return;
    asked = true;
    reg.waiting.postMessage("SKIP_WAITING");
  };

  const onController = () => {
    if (asked && canReload()) window.location.reload();
  };

  navigator.serviceWorker.addEventListener("controllerchange", onController);

  void navigator.serviceWorker
    .register("/sw.js", { updateViaCache: "none" })
    .then((reg) => {
      if (cancelled) return;
      const active = reg.active ?? navigator.serviceWorker.controller;
      if (active) active.postMessage({ type: "PRECACHE", urls: shellUrls() });
      trySwap(reg);
      reg.addEventListener("updatefound", () => {
        const sw = reg.installing;
        sw?.addEventListener("statechange", () => {
          if (sw.state === "installed") trySwap(reg);
        });
      });
      const tick = window.setInterval(() => {
        void reg.update().catch(() => undefined);
        trySwap(reg);
      }, 60_000);
      if (cancelled) window.clearInterval(tick);
      cleanup = () => window.clearInterval(tick);
    })
    .catch(() => {
      /* online game unchanged */
    });

  let cleanup = () => {};
  return () => {
    cancelled = true;
    cleanup();
    navigator.serviceWorker.removeEventListener("controllerchange", onController);
  };
}

export function watchLine(onChange: (online: boolean) => void): () => void {
  const fire = () => onChange(navigator.onLine);
  fire();
  window.addEventListener("online", fire);
  window.addEventListener("offline", fire);
  return () => {
    window.removeEventListener("online", fire);
    window.removeEventListener("offline", fire);
  };
}
