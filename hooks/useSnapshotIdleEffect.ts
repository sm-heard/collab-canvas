import { useEffect, useRef } from "react";

import { useUiStore } from "@/lib/store";

export function useSnapshotIdleEffect(latestAiUpdatedAt: number | null) {
  const setLastAiSnapshotAt = useUiStore((state) => state.setLastAiSnapshotAt);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (latestAiUpdatedAt === null) {
      setLastAiSnapshotAt(null);
      return () => undefined;
    }

    timerRef.current = setTimeout(() => {
      setLastAiSnapshotAt(Date.now());
      timerRef.current = null;
    }, 10_000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [latestAiUpdatedAt, setLastAiSnapshotAt]);
}
