import type { PieceId } from "./types";

export type ThemeId =
  | "ink"
  | "slate"
  | "deuter"
  | "night"
  | "neon"
  | "sakura"
  | "molten"
  | "ice"
  | "monolith"
  | "lcd";

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
  {
    id: "neon",
    name: "Neon Arcade",
    blurb: "Black cabinet. Plastics that glow.",
    cost: 160,
    well: "#07070c",
    grid: "#12121c",
    pit: "#030308",
    frame: "#2a2040",
    ghost: "rgba(255, 80, 220, 0.28)",
    flash: "#f8f0ff",
    fill: {
      I: "#18f0ff",
      O: "#ffe14a",
      T: "#ff3dce",
      S: "#7cff2e",
      Z: "#ff3355",
      J: "#4d7cff",
      L: "#ff8a1a",
    },
    deep: {
      I: "#0a8a96",
      O: "#b89612",
      T: "#a01880",
      S: "#3e8a12",
      Z: "#a01228",
      J: "#2848a8",
      L: "#a85208",
    },
  },
  {
    id: "sakura",
    name: "Sakura Night",
    blurb: "Plum pit. Ivory, rose, and one jade.",
    cost: 160,
    well: "#161018",
    grid: "#221820",
    pit: "#0c080e",
    frame: "#4a3040",
    ghost: "rgba(255, 220, 230, 0.3)",
    flash: "#fff4f6",
    fill: {
      I: "#f4c4d4",
      O: "#f6ead4",
      T: "#e8789c",
      S: "#6cbc8c",
      Z: "#d45a72",
      J: "#c9a0c4",
      L: "#e8a070",
    },
    deep: {
      I: "#b07890",
      O: "#b8a888",
      T: "#a04064",
      S: "#3e7858",
      Z: "#8a3048",
      J: "#806080",
      L: "#a86840",
    },
  },
  {
    id: "molten",
    name: "Molten",
    blurb: "Cooled lava. Ember, slag, and gold.",
    cost: 180,
    well: "#100c0a",
    grid: "#1c1410",
    pit: "#080604",
    frame: "#4a3020",
    ghost: "rgba(255, 180, 80, 0.28)",
    flash: "#ffe8c8",
    fill: {
      I: "#f0c060",
      O: "#8a8078",
      T: "#c06040",
      S: "#6a5848",
      Z: "#e04828",
      J: "#5a504c",
      L: "#ff7a28",
    },
    deep: {
      I: "#a87828",
      O: "#545048",
      T: "#803828",
      S: "#403830",
      Z: "#982418",
      J: "#383430",
      L: "#b84810",
    },
  },
  {
    id: "ice",
    name: "Ice Glass",
    blurb: "Frosted crystal. Keep the landing bright.",
    cost: 180,
    well: "#10161c",
    grid: "#182028",
    pit: "#080c12",
    frame: "#3a5060",
    ghost: "rgba(220, 245, 255, 0.42)",
    flash: "#f4fcff",
    fill: {
      I: "#b8f0ff",
      O: "#e8f4f8",
      T: "#9ad0e8",
      S: "#7ec8c0",
      Z: "#6aa8d4",
      J: "#5a88c8",
      L: "#d0e4f0",
    },
    deep: {
      I: "#5aa0b8",
      O: "#98a8b0",
      T: "#4a80a0",
      S: "#3e8880",
      Z: "#386888",
      J: "#2c5088",
      L: "#7890a0",
    },
  },
  {
    id: "monolith",
    name: "Monolith",
    blurb: "One dark stone. Marks and edges do the work.",
    cost: 200,
    well: "#0c0c0e",
    grid: "#161618",
    pit: "#060606",
    frame: "#2a2a2e",
    ghost: "rgba(230, 230, 228, 0.26)",
    flash: "#ecece8",
    fill: {
      I: "#3a4044",
      O: "#48443e",
      T: "#403c44",
      S: "#3a423c",
      Z: "#443838",
      J: "#383c44",
      L: "#443c36",
    },
    deep: {
      I: "#1c2024",
      O: "#282420",
      T: "#221e24",
      S: "#1c221e",
      Z: "#241c1c",
      J: "#1c1e24",
      L: "#241e1a",
    },
  },
  {
    id: "lcd",
    name: "Game & Watch",
    blurb: "Cream LCD. Olive segments. Classic's cabinet.",
    cost: 140,
    well: "#c8c8a8",
    grid: "#b8b898",
    pit: "#b0b090",
    frame: "#4a5040",
    ghost: "rgba(40, 48, 32, 0.28)",
    flash: "#2a3020",
    fill: {
      I: "#2c3424",
      O: "#3a402c",
      T: "#323828",
      S: "#2a3828",
      Z: "#383024",
      J: "#283428",
      L: "#3a3824",
    },
    deep: {
      I: "#181c14",
      O: "#222418",
      T: "#1c2016",
      S: "#162016",
      Z: "#201c14",
      J: "#141c16",
      L: "#222014",
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
