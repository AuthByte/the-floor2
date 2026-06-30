export type LayoutSkin = "ops" | "gallery";

export const LAYOUT_SKIN_STORAGE = "floor.layoutSkin";

export const LAYOUT_SKIN_META: Record<
  LayoutSkin,
  { label: string; short: string; description: string }
> = {
  ops: {
    label: "After-Hours Ops",
    short: "ops",
    description: "Terminal grain, brass accents, dense trading-desk chrome.",
  },
  gallery: {
    label: "Meridian Suite",
    short: "suite",
    description: "Frosted panels, softer depth, private-bank polish.",
  },
};

export function initialLayoutSkin(): LayoutSkin {
  try {
    const stored = localStorage.getItem(LAYOUT_SKIN_STORAGE);
    return stored === "gallery" ? "gallery" : "ops";
  } catch {
    return "ops";
  }
}

export function persistLayoutSkin(skin: LayoutSkin) {
  try {
    localStorage.setItem(LAYOUT_SKIN_STORAGE, skin);
  } catch {
    /* ignore */
  }
}
