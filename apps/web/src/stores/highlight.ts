"use client";
import { create } from "zustand";

/** Cross-view state: hovering a wiki-link in the documentary pulses the graph node and
 * vice versa; selecting opens the NodePanel from any view. */
type HighlightState = {
  hoveredEntityId: string | null;
  selectedEntityId: string | null;
  setHovered: (id: string | null) => void;
  setSelected: (id: string | null) => void;
};

export const useHighlight = create<HighlightState>((set) => ({
  hoveredEntityId: null,
  selectedEntityId: null,
  setHovered: (id) => set({ hoveredEntityId: id }),
  setSelected: (id) => set({ selectedEntityId: id }),
}));
