"use client";

import { useEffect } from "react";
import {
  useOthers,
  useSelf,
  useStatus,
  useUpdateMyPresence,
} from "@liveblocks/react";
import { colorFromUserId, getContrastColor } from "@/lib/colors";
import { useUiStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<string, string> = {
  connecting: "Connecting…",
  "connected-first": "Connected",
  connected: "Connected",
  synchronizing: "Syncing…",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

function Avatar({
  name,
  color,
  title,
}: {
  name: string;
  color: string;
  title?: string;
}) {
  const contrast = getContrastColor(color);
  return (
    <div
      title={title ?? name}
      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold shadow-sm"
      style={{ backgroundColor: color, color: contrast }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

export function LiveblocksPresenceSummary() {
  const status = useStatus();
  const self = useSelf();
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();
  const aiActiveUser = useUiStore((state) => state.aiActiveUser);
  const lastAiSnapshotAt = useUiStore((state) => state.lastAiSnapshotAt);

  useEffect(() => {
    updateMyPresence({ state: "online" });
  }, [updateMyPresence]);

  const allUsers = [
    {
      id: `self-${self?.id ?? "self"}`,
      name: self?.info?.name ?? self?.id ?? "You",
      color: colorFromUserId(self?.id),
      isSelf: true,
    },
    ...others.map((other) => ({
      id: `other-${other.connectionId}`,
      name: other.info?.name ?? "Guest",
      color: colorFromUserId(String(other.connectionId)),
      isSelf: false,
    })),
  ];

  return (
    <div className="space-y-4 rounded-lg border border-border/80 bg-background/70 p-4 shadow-sm">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Live room
        </p>
        <p className="text-sm font-semibold text-foreground">
          {STATUS_LABEL[status] ?? status}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {allUsers.slice(0, 6).map((user) => (
          <Avatar
            key={user.id}
            name={user.name}
            color={user.color}
            title={user.isSelf ? `${user.name} (you)` : user.name}
          />
        ))}
        {allUsers.length > 6 ? (
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border/60 text-xs font-medium text-muted-foreground">
            +{allUsers.length - 6}
          </div>
        ) : null}
      </div>
      {aiActiveUser ? (
        <div
          className={cn(
            "rounded-lg border border-dashed px-3 py-2 text-xs",
            aiActiveUser.status === "error"
              ? "border-rose-400 bg-rose-50 text-rose-700"
              : "border-purple-400 bg-purple-50 text-purple-700",
          )}
        >
          <span className="font-semibold">
            AI agent {aiActiveUser.status === "error" ? "encountered an issue" : "running"}
          </span>
          {aiActiveUser.message ? ` — ${aiActiveUser.message}` : ` — ${aiActiveUser.prompt}`}
        </div>
      ) : null}
      {lastAiSnapshotAt ? (
        <p className="text-xs text-muted-foreground">
          Last AI snapshot recorded {new Date(lastAiSnapshotAt).toLocaleTimeString()}.
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {others.length === 0
          ? "No collaborators yet. Invite someone to join!"
          : others.length === 1
            ? "One collaborator is live."
            : `${others.length} collaborators are live.`}
      </p>
    </div>
  );
}

export default LiveblocksPresenceSummary;

