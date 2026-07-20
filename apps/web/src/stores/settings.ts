"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** User-chosen research config, persisted to localStorage.
 * llmProvider: "auto" | "none" | provider id.
 * categories: null = run all; otherwise the subset to run. */
type SettingsState = {
  llmProvider: string;
  categories: string[] | null;
  setLlmProvider: (id: string) => void;
  toggleCategory: (id: string, all: string[]) => void;
  isCategoryOn: (id: string) => boolean;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      llmProvider: "auto",
      categories: null,
      setLlmProvider: (id) => set({ llmProvider: id }),
      isCategoryOn: (id) => {
        const cats = get().categories;
        return cats === null || cats.includes(id);
      },
      toggleCategory: (id, all) => {
        const current = get().categories ?? all;
        const next = current.includes(id)
          ? current.filter((c) => c !== id)
          : [...current, id];
        // collapse "everything selected" back to null (= all)
        set({ categories: next.length === all.length ? null : next });
      },
    }),
    { name: "lynx-settings" },
  ),
);
