"use client";

import { useEffect, useMemo } from "react";
import {
  useOthers,
  useSelf,
  useStatus,
  useUpdateMyPresence,
} from "@liveblocks/react";

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  "connected-first": "Connected",
  connected: "Connected",
  synchronizing: "Syncing…",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

export function LiveblocksPresenceSummary() {
  const status = useStatus();
  const presenceLabel = STATUS_LABEL[status] ?? status;
  const self = useSelf();
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();

  useEffect(() => {
    updateMyPresence({ state: "online" });
  }, [updateMyPresence]);

  const othersLabel = useMemo(() => {
    if (others.length === 0) {
      return "You're the only one here";
    }

    const names = others
      .map((other) => other.info?.name ?? "Anonymous")
      .slice(0, 3);

    const suffix = others.length > names.length ? "…" : "";

    return `${names.join(", ")}${suffix}`;
  }, [others]);

  return (
    <div className="rounded-lg border border-border/80 bg-background/70 p-4 text-left shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Live room status
      </p>
      <div className="mt-2 space-y-1 text-sm">
        <p>
          <span className="font-semibold text-foreground">Connection:</span>{" "}
          <span className="text-muted-foreground">{presenceLabel}</span>
        </p>
        <p>
          <span className="font-semibold text-foreground">You:</span>{" "}
          <span className="text-muted-foreground">
            {self?.info?.name ?? self?.id ?? "Unknown user"}
          </span>
        </p>
        <p>
          <span className="font-semibold text-foreground">Others:</span>{" "}
          <span className="text-muted-foreground">
            {others.length === 0
              ? "No one else yet"
              : `${others.length} online — ${othersLabel}`}
          </span>
        </p>
      </div>
    </div>
  );
}

export default LiveblocksPresenceSummary;

