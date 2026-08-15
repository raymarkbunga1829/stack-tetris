import { grantSku, SKUS, type Sku, type Wallet } from "./shop";

export const IOS_BUNDLE_ID = "app.stack.play";

export function storeProductId(sku: Sku): string {
  return `${IOS_BUNDLE_ID}.${sku.id}`;
}

export async function isNativeIos(): Promise<boolean> {
  try {
    const { Capacitor } = await import("@capacitor/core");
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  } catch {
    return false;
  }
}

type CdvStore = {
  register: (products: { id: string; type: string; platform: string }[]) => void;
  initialize: (platforms: string[]) => Promise<unknown>;
  get: (id: string) => { getOffer?: () => { order: () => Promise<unknown> } | undefined } | undefined;
  when: () => {
    approved: (fn: (tx: { finish: () => Promise<unknown>; products: { id: string }[] }) => void) => {
      finished: (fn: (tx: { products: { id: string }[] }) => void) => unknown;
    };
  };
};

function cdv():
  | { store: CdvStore; ProductType: { CONSUMABLE: string }; Platform: { APPLE_APPSTORE: string } }
  | null {
  const g = globalThis as typeof globalThis & {
    CdvPurchase?: {
      store: CdvStore;
      ProductType: { CONSUMABLE: string };
      Platform: { APPLE_APPSTORE: string };
    };
  };
  return g.CdvPurchase ?? null;
}

let storeReady: Promise<boolean> | null = null;

async function ensureStore(): Promise<boolean> {
  if (storeReady) return storeReady;
  storeReady = (async () => {
    /* CdvPurchase is injected by the native plugin after cap sync */
    const api = cdv();
    if (!api) return false;
    api.store.register(
      SKUS.map((sku) => ({
        id: storeProductId(sku),
        type: api.ProductType.CONSUMABLE,
        platform: api.Platform.APPLE_APPSTORE,
      })),
    );
    await api.store.initialize([api.Platform.APPLE_APPSTORE]);
    return true;
  })();
  return storeReady;
}

export async function buySku<T extends Wallet>(save: T, skuId: string): Promise<T | null> {
  const sku = SKUS.find((s) => s.id === skuId);
  if (!sku) return null;

  if (await isNativeIos()) {
    const ok = await ensureStore();
    const api = cdv();
    if (!ok || !api) {
      console.warn("[iap] StoreKit plugin not ready. Create products in App Store Connect.");
      return null;
    }
    const product = api.store.get(storeProductId(sku));
    const offer = product?.getOffer?.();
    if (!offer) return null;
    return new Promise((resolve) => {
      let settled = false;
      api.store.when().approved((tx) => {
        void tx.finish();
      }).finished((tx) => {
        if (settled) return;
        const hit = tx.products.some((p) => p.id === storeProductId(sku));
        if (!hit) return;
        settled = true;
        resolve(grantSku(save, sku));
      });
      void offer.order().catch(() => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      });
    });
  }

  return new Promise((resolve) => {
    window.setTimeout(() => resolve(grantSku(save, sku)), 380);
  });
}
