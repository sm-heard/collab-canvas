"use client";

import "@tldraw/tldraw/tldraw.css";

import { useMemo } from "react";
import { Tldraw, createTLStore, defaultShapeUtils } from "@tldraw/tldraw";

export function Canvas() {
  const store = useMemo(() => {
    return createTLStore({
      shapeUtils: defaultShapeUtils,
    });
  }, []);

  return (
    <div className="relative flex h-[560px] w-full flex-1 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-inner">
      <Tldraw
        store={store}
        persistenceKey="collab-canvas-demo"
        autoFocus
        hideUi={false}
        className="tldraw-theme-light"
      />
      <div className="pointer-events-none absolute bottom-4 right-4 max-w-xs rounded-lg bg-background/90 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm">
        <p className="font-semibold text-foreground">Canvas preview</p>
        <p>
          Use the toolbar to draw rectangles, select with <span className="font-semibold">V</span>,
          and pan with <span className="font-semibold">Space</span>.
        </p>
      </div>
    </div>
  );
}

export default Canvas;

