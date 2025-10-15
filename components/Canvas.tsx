"use client";

import "@tldraw/tldraw/tldraw.css";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useOthers, useUpdateMyPresence } from "@liveblocks/react";
import { Tldraw, createTLStore, defaultShapeUtils } from "@tldraw/tldraw";
import { colorFromUserId, getContrastColor } from "@/lib/colors";

type CursorPoint = {
  x: number;
  y: number;
};

type PresenceCursor = CursorPoint | null | undefined;

function isCursorPoint(value: unknown): value is CursorPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number"
  );
}

export function Canvas() {
  const store = useMemo(() => createTLStore({ shapeUtils: defaultShapeUtils }), []);
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    updateMyPresence({ cursor: null });
  }, [updateMyPresence]);

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const bounds = containerRef.current?.getBoundingClientRect();
      if (!bounds) {
        return;
      }

      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;

      updateMyPresence({ cursor: { x, y } satisfies CursorPoint });
    },
    [updateMyPresence],
  );

  const clearCursor = useCallback(() => {
    updateMyPresence({ cursor: null });
  }, [updateMyPresence]);

  return (
    <div
      ref={containerRef}
      className="relative flex h-[560px] w-full flex-1 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-inner"
      onPointerMove={handlePointerMove}
      onPointerLeave={clearCursor}
      onPointerUp={clearCursor}
    >
      <Tldraw store={store} autoFocus hideUi={false} className="tldraw-theme-light" />
      <div className="pointer-events-none absolute inset-0">
        {others
          .map((other) => {
            const cursor = other.presence?.cursor as PresenceCursor;
            if (!isCursorPoint(cursor)) {
              return null;
            }

            const userId = typeof other.id === "string" ? other.id : String(other.connectionId);
            const name = other.info?.name ?? "Guest";
            const color = colorFromUserId(userId);
            const contrast = getContrastColor(color);

            return (
              <div
                key={other.connectionId}
                className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
                style={{ left: cursor.x, top: cursor.y }}
              >
                <div
                  className="h-3 w-3 rotate-45 rounded-sm shadow-sm"
                  style={{ backgroundColor: color }}
                />
                <div
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold shadow-sm"
                  style={{ backgroundColor: color, color: contrast }}
                >
                  {name}
                </div>
              </div>
            );
          })
          .filter(Boolean)}
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 max-w-xs rounded-lg bg-background/90 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm">
        <p className="font-semibold text-foreground">Canvas preview</p>
        <p>
          Draw rectangles, select with <span className="font-semibold">V</span>, and pan with
          <span className="font-semibold"> Space</span>.
        </p>
      </div>
    </div>
  );
}

export default Canvas;

