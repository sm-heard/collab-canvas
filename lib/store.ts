import { create } from "zustand";
import type { JsonShape } from "@/lib/schema";

type ShapeId = JsonShape["id"];

type ShapeDelta = {
  action: "upsert" | "delete";
  shapeId: ShapeId;
  shape?: JsonShape;
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
        [delta.shapeId]: delta,
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
