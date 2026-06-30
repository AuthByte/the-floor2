import { useEffect } from "react";

const THEME_STORAGE = "floor.theme";

/** Applies saved floor theme on standalone routes (pricing, legal) outside App. */
export function useFloorThemeSync() {
  useEffect(() => {
    const apply = () => {
      const stored = localStorage.getItem(THEME_STORAGE);
      const dark = stored === "dark";
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    window.addEventListener("storage", apply);
    return () => window.removeEventListener("storage", apply);
  }, []);
}
