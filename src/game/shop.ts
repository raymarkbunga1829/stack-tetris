export type PowerId = "zap" | "slow" | "shield" | "quake" | "pick";

export type Inventory = Record<PowerId, number>;

export const POWERS: {
  id: PowerId;
  name: string;
  blurb: string;
  cost: number;
}[] = [
  { id: "zap", name: "Zap", blurb: "Clear the lowest dirty row.", cost: 40 },
  { id: "slow", name: "Slow", blurb: "Gravity eases for 12 seconds.", cost: 50 },
  { id: "shield", name: "Shield", blurb: "Survive one top-out.", cost: 70 },
  { id: "quake", name: "Quake", blurb: "Wipe the bottom two rows.", cost: 90 },
  { id: "pick", name: "Pick", blurb: "Swap in a piece from Next.", cost: 60 },
];

export type Sku = {
  id: string;
  name: string;
  blurb: string;
  price: string;
  cents: number;
  credits: number;
  items?: Partial<Inventory>;
};

export const SKUS: Sku[] = [
  {
    id: "credits_s",
    name: "Pocket credits",
    blurb: "250 CR",
    price: "$0.99",
    cents: 99,
    credits: 250,
  },
  {
    id: "credits_m",
    name: "Stack of credits",
    blurb: "900 CR",
    price: "$2.99",
    cents: 299,
    credits: 900,
  },
  {
    id: "credits_l",
    name: "Crate of credits",
    blurb: "2,500 CR",
    price: "$6.99",
    cents: 699,
    credits: 2500,
  },
  {
    id: "pack_ops",
    name: "Ops pack",
    blurb: "500 CR + 2 of each power",
    price: "$4.99",
    cents: 499,
    credits: 500,
    items: { zap: 2, slow: 2, shield: 2, quake: 2, pick: 2 },
  },
  {
    id: "theme_night",
    name: "Night well",
    blurb: "High-contrast lock flash",
    price: "$0.99",
    cents: 99,
    credits: 0,
  },
];

export function emptyInv(): Inventory {
  return { zap: 0, slow: 0, shield: 0, quake: 0, pick: 1 };
}

export function addInv(inv: Inventory, extra: Partial<Inventory>): Inventory {
  return {
    zap: inv.zap + (extra.zap ?? 0),
    slow: inv.slow + (extra.slow ?? 0),
    shield: inv.shield + (extra.shield ?? 0),
    quake: inv.quake + (extra.quake ?? 0),
    pick: (inv.pick ?? 0) + (extra.pick ?? 0),
  };
}

export type Receipt = {
  id: string;
  sku: string;
  t: number;
  credits: number;
};

export type Wallet = {
  credits: number;
  inv: Inventory;
  receipts: Receipt[];
};

export function buyWithCredits<T extends Wallet>(save: T, power: PowerId): T | null {
  const item = POWERS.find((p) => p.id === power);
  if (!item || save.credits < item.cost) return null;
  return {
    ...save,
    credits: save.credits - item.cost,
    inv: addInv(save.inv, { [power]: 1 }),
  };
}

export function consumePower<T extends Wallet>(save: T, power: PowerId): T | null {
  if ((save.inv[power] ?? 0) < 1) return null;
  return {
    ...save,
    inv: { ...save.inv, [power]: save.inv[power] - 1 },
  };
}

export function grantSku<T extends Wallet>(save: T, sku: Sku): T {
  const receipt: Receipt = {
    id: `${sku.id}-${Date.now()}`,
    sku: sku.id,
    t: Date.now(),
    credits: sku.credits,
  };
  return {
    ...save,
    credits: save.credits + sku.credits,
    inv: sku.items ? addInv(save.inv, sku.items) : save.inv,
    receipts: [...save.receipts, receipt],
  };
}

/** Web: demo grant. iOS: StoreKit via src/game/iap.ts */
export async function purchaseSku<T extends Wallet>(
  save: T,
  skuId: string,
): Promise<T | null> {
  const { buySku } = await import("./iap");
  return buySku(save, skuId);
}

export const COIN_FOR_LINES = [0, 1, 3, 6, 14];
