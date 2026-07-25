"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";

/** User-entered API keys, kept only in the browser (localStorage: "lynx-api-keys").
 * Keyed by provider id (e.g. "groq", "openrouter"). Keys are written to localStorage
 * only when `save` is on; otherwise they live in memory for the session and vanish on reload. */
type ApiKeysState = {
  keys: Record<string, string>;
  save: boolean;
  setKey: (provider: string, value: string) => void;
  clearKey: (provider: string) => void;
  hasKey: (provider: string) => boolean;
  setSave: (value: boolean) => void;
};

export const useApiKeys = create<ApiKeysState>()(
  persist(
    (set, get) => ({
      keys: {},
      save: true,
      setKey: (provider, value) =>
        set((s) => {
          const keys = { ...s.keys };
          const v = value.trim();
          if (v) keys[provider] = v;
          else delete keys[provider];
          return { keys };
        }),
      clearKey: (provider) =>
        set((s) => {
          const keys = { ...s.keys };
          delete keys[provider];
          return { keys };
        }),
      hasKey: (provider) => Boolean(get().keys[provider]),
      setSave: (value) => set({ save: value }),
    }),
    {
      name: "lynx-api-keys",
      // remember the choice always; persist the keys themselves only when saving is on.
      // turning save off re-writes the blob without keys, so any previously saved keys are dropped.
      partialize: (s) => (s.save ? { keys: s.keys, save: s.save } : { save: s.save }),
    },
  ),
);
