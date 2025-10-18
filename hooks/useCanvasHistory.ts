import { useCallback, useMemo } from "react";
import { useRoom } from "@liveblocks/react";

export function useCanvasHistory() {
  const room = useRoom();

  const history = useMemo(() => room?.history, [room]);

  const revertLastAiCommand = useCallback(() => {
    history?.undo();
  }, [history]);

  const canRevertAi = history?.canUndo ?? false;

  return {
    revertLastAiCommand,
    canRevertAi,
  };
}
