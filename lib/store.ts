import { create } from "zustand";
import type { JsonShape } from "@/lib/schema";
import type { AiCommandSummary, AiCommandStatus } from "@/lib/ai/types";

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

type AiCommandHistoryEntry = AiCommandSummary & { startedAt: number };

type UiState = {
  aiTrayOpen: boolean;
  aiCommandStatus: AiCommandStatus;
  aiHistory: AiCommandHistoryEntry[];
  aiActiveUser?: { userId: string; prompt: string; status: "running" | "error"; message?: string } | null;
  lastAiSnapshotAt?: number | null;
  toggleAiTray: (open?: boolean) => void;
  addAiHistoryEntry: (entry: AiCommandSummary) => void;
  updateAiHistoryEntry: (commandId: string, partial: Partial<AiCommandSummary>) => void;
  clearAiHistory: () => void;
  setAiCommandStatus: (status: AiCommandStatus) => void;
  setAiActiveUser: (payload: { userId: string; prompt: string; status: "running" | "error"; message?: string } | null) => void;
  setLastAiSnapshotAt: (timestamp: number | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  aiTrayOpen: false,
  aiCommandStatus: "idle",
  aiHistory: [],
  aiActiveUser: null,
  lastAiSnapshotAt: null,
  toggleAiTray: (open) =>
    set((state) => ({ aiTrayOpen: open ?? !state.aiTrayOpen })),
  addAiHistoryEntry: (entry) =>
    set((state) => ({
      aiHistory: [
        { ...entry, startedAt: Date.now() },
        ...state.aiHistory,
      ].slice(0, 20),
    })),
  updateAiHistoryEntry: (commandId, partial) =>
    set((state) => ({
      aiHistory: state.aiHistory.map((item) =>
        item.commandId === commandId ? { ...item, ...partial } : item,
      ),
    })),
  clearAiHistory: () => set({ aiHistory: [] }),
  setAiCommandStatus: (status) => set({ aiCommandStatus: status }),
  setAiActiveUser: (payload) => set({ aiActiveUser: payload }),
  setLastAiSnapshotAt: (timestamp) => set({ lastAiSnapshotAt: timestamp }),
}));

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
export type { AiCommandHistoryEntry };
