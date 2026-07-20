"use client";
import { useEffect } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "dark" | "light" | "system";

type ThemeState = {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
};

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      mode: "system",
      setMode: (mode) => set({ mode }),
    }),
    { name: "lynx-theme" },
  ),
);

function resolve(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    return typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return mode;
}

/** Applies the resolved theme to <html data-theme> and keeps it in sync
 *  with the OS preference while in "system" mode. Mount once, high in the tree. */
export function useApplyTheme() {
  const mode = useTheme((s) => s.mode);
  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolve(mode);
    };
    apply();
    if (mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode]);
}
