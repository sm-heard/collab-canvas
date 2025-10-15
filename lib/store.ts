import { create } from "zustand";
import type { JsonRectangle } from "@/lib/schema";

type ShapeId = JsonRectangle["id"];

type ShapeDelta = {
  shape: JsonRectangle;
  updatedAt: number;
  updatedBy: string | null;
};

type DeltaState = {
  pending: Record<ShapeId, ShapeDelta>;
  queueDelta: (delta: ShapeDelta) => void;
  takeDeltas: () => ShapeDelta[];
};

export const useShapeDeltaStore = create<DeltaState>((set, get) => ({
  pending: {},
  queueDelta: (delta) => {
    set((state) => ({
      pending: {
        ...state.pending,
        [delta.shape.id]: delta,
      },
    }));
  },
  takeDeltas: () => {
    const deltas = Object.values(get().pending);
    set({ pending: {} });
    return deltas;
  },
}));

export type { ShapeDelta };
