import type { PieceId } from "./types";

export type ThemeId = "ink" | "slate" | "deuter" | "night";

export type Theme = {
  id: ThemeId;
  name: string;
  blurb: string;
  cost: number;
  well: string;
  grid: string;
  pit: string;
  frame: string;
  ghost: string;
  flash: string;
  fill: Record<PieceId, string>;
  deep: Record<PieceId, string>;
};

export const THEMES: Theme[] = [
  {
    id: "ink",
    name: "Ink",
    blurb: "House cut. Soft aqua, citrine, and ruby in a dark pit.",
    cost: 0,
    well: "#101218",
    grid: "#1b1e28",
    pit: "#0b0c10",
    frame: "#2a2e3a",
    ghost: "rgba(232, 230, 225, 0.22)",
    flash: "#f2efe6",
    fill: {
      I: "#6ee0e4",
      O: "#e4cc62",
      T: "#b08ad4",
      S: "#78c47c",
      Z: "#e07878",
      J: "#6a92e0",
      L: "#e09852",
    },
    deep: {
      I: "#3a8e92",
      O: "#8f8038",
      T: "#6d5686",
      S: "#45784a",
      Z: "#8a4545",
      J: "#3c5791",
      L: "#8c5c2e",
    },
  },
  {
    id: "slate",
    name: "Slate",
    blurb: "Muted stones. Cooler metal, quieter fire.",
    cost: 80,
    well: "#12151c",
    grid: "#1c212b",
    pit: "#0a0c10",
    frame: "#323846",
    ghost: "rgba(210, 220, 230, 0.22)",
    flash: "#e8eef4",
    fill: {
      I: "#7aa8b8",
      O: "#b8b09a",
      T: "#8f93a8",
      S: "#7a9a8a",
      Z: "#a88888",
      J: "#6e86a4",
      L: "#b49a7a",
    },
    deep: {
      I: "#4d7380",
      O: "#7a7464",
      T: "#5c6074",
      S: "#4e6a5c",
      Z: "#745858",
      J: "#455870",
      L: "#7a6850",
    },
  },
  {
    id: "deuter",
    name: "Clear",
    blurb: "High-separation cut. Easy to read in any light.",
    cost: 120,
    well: "#101218",
    grid: "#1b1e28",
    pit: "#0b0c10",
    frame: "#2a2e3a",
    ghost: "rgba(232, 230, 225, 0.28)",
    flash: "#f2efe6",
    fill: {
      I: "#56b4e9",
      O: "#f0e442",
      T: "#cc79a7",
      S: "#009e73",
      Z: "#d55e00",
      J: "#0072b2",
      L: "#e69f00",
    },
    deep: {
      I: "#2d7ea6",
      O: "#b3a82c",
      T: "#965478",
      S: "#066e52",
      Z: "#9a4200",
      J: "#044e7a",
      L: "#a67300",
    },
  },
  {
    id: "night",
    name: "Night",
    blurb: "Black velvet pit. Gems throw a hard lock flash.",
    cost: 200,
    well: "#07080c",
    grid: "#141820",
    pit: "#040508",
    frame: "#3a4254",
    ghost: "rgba(255, 255, 255, 0.28)",
    flash: "#ffffff",
    fill: {
      I: "#7ee0e6",
      O: "#ffe08a",
      T: "#c9a4e6",
      S: "#8ed896",
      Z: "#f08a8a",
      J: "#7aa6f0",
      L: "#f0a86a",
    },
    deep: {
      I: "#3ea8ae",
      O: "#c9a84a",
      T: "#8e6ab4",
      S: "#4e9a58",
      Z: "#c45454",
      J: "#4a74c8",
      L: "#c47438",
    },
  },
];

export const GEM_NAME: Record<PieceId, string> = {
  I: "Aquamarine",
  O: "Citrine",
  T: "Amethyst",
  S: "Emerald",
  Z: "Ruby",
  J: "Sapphire",
  L: "Topaz",
};

export function themeOf(id: ThemeId | string | undefined): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]!;
}

export function ownsTheme(owned: ThemeId[], id: ThemeId): boolean {
  return id === "ink" || owned.includes(id);
}

export function buyTheme<T extends { credits: number; themes: ThemeId[]; theme: ThemeId }>(
  save: T,
  id: ThemeId,
): T | null {
  const theme = themeOf(id);
  if (ownsTheme(save.themes, id)) {
    return { ...save, theme: id };
  }
  if (save.credits < theme.cost) return null;
  return {
    ...save,
    credits: save.credits - theme.cost,
    themes: save.themes.includes(id) ? save.themes : [...save.themes, id],
    theme: id,
  };
}
