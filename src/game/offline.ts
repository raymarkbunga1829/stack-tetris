/** Register the offline shell and report when a newer build is waiting. Fail quiet. */

const CHECK_GAP_MS = 15_000;
const SWAP_TIMEOUT_MS = 4_000;

/**
 * `onReady(apply)` fires when a new build is installed and waiting (or another
 * tab already switched to it). Calling `apply` activates it and reloads. The
 * swap only ever happens on that call, so a run is never interrupted.
 */
export function registerOffline(onReady: (apply: () => void) => void): () => void {
  if (typeof window === "undefined") return () => {};
  if (!("serviceWorker" in navigator)) return () => {};
  if (!import.meta.env.PROD) return () => {};

  const sw = navigator.serviceWorker;
  let reg: ServiceWorkerRegistration | null = null;
  let cancelled = false;
  let applied = false;
  let reloading = false;
  let lastCheck = 0;
  let tick = 0;
  // The first install claims the page too; only later controller changes mean a new build.
  let hadController = Boolean(sw.controller);

  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  const apply = () => {
    const waiting = reg?.waiting;
    if (!waiting) {
      reload();
      return;
    }
    applied = true;
    waiting.postMessage("SKIP_WAITING");
    // Documents are network-first, so a reload lands on the new build even if
    // the worker swap stalls.
    window.setTimeout(reload, SWAP_TIMEOUT_MS);
  };

  const offer = () => {
    if (!cancelled && reg?.waiting && sw.controller) onReady(apply);
  };

  const check = () => {
    if (!reg || cancelled || Date.now() - lastCheck < CHECK_GAP_MS) return;
    lastCheck = Date.now();
    void reg.update().catch(() => undefined);
  };

  const onController = () => {
    if (applied) reload();
    else if (hadController && !cancelled) onReady(reload);
    hadController = true;
  };

  // iOS home-screen apps resume from memory without reloading, so check on resume.
  const onVisible = () => {
    if (document.visibilityState === "visible") check();
  };

  sw.addEventListener("controllerchange", onController);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", check);
  window.addEventListener("online", check);

  void sw
    .register("/sw.js", { updateViaCache: "none" })
    .then((r) => {
      if (cancelled) return;
      reg = r;
      offer();
      r.addEventListener("updatefound", () => {
        const next = r.installing;
        next?.addEventListener("statechange", () => {
          if (next.state === "installed") offer();
        });
      });
      tick = window.setInterval(check, 60_000);
    })
    .catch(() => {
      /* online game unchanged */
    });

  return () => {
    cancelled = true;
    window.clearInterval(tick);
    sw.removeEventListener("controllerchange", onController);
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener("pageshow", check);
    window.removeEventListener("online", check);
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
