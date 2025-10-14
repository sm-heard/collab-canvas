"use client";

import { createClient } from "@liveblocks/client";
import { createLiveblocksContext } from "@liveblocks/react";
import { createRoomContext } from "@liveblocks/react";
import { auth } from "@/lib/firebase";
import { type ReactNode } from "react";

const client = createClient({
  throttle: 100,
  authEndpoint: async (body) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      console.warn("Liveblocks authEndpoint called without an authenticated Firebase user.");
      throw new Error("Liveblocks auth requires a signed-in Firebase user.");
    }

    const idToken = await currentUser.getIdToken();

    const response = await fetch("/api/liveblocks-auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body ?? {}),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error ?? "Liveblocks auth failed";
      throw new Error(message);
    }

    return response.json();
  },
});

const { LiveblocksProvider } = createLiveblocksContext(client);
const { RoomProvider } = createRoomContext(client);

export function LiveblocksRoomProvider({ children }: { children: ReactNode }) {
  return (
    <LiveblocksProvider>
      <RoomProvider id="rooms/default">{children}</RoomProvider>
    </LiveblocksProvider>
  );
}

