"use client";

import "@tldraw/tldraw/tldraw.css";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { LiveMap, LiveObject } from "@liveblocks/client";
import {
  useMutation,
  useOthers,
  useStorage,
  useStorageRoot,
  useStatus,
  useUpdateMyPresence,
} from "@liveblocks/react";
import {
  StoreSnapshot,
  TLGeoShape,
  TLGeoShapeProps,
  TLRecord,
  TLShape,
  TLShapeId,
  TLShapePartial,
  Tldraw,
  createTLStore,
  defaultShapeUtils,
} from "@tldraw/tldraw";
import throttle from "lodash/throttle";
import { colorFromUserId, getContrastColor } from "@/lib/colors";
import type { JsonRectangle, ShapeMetadata } from "@/lib/schema";
import { useAuth } from "@/hooks/useAuth";

const STORAGE_MAP_KEY = "shapes";
const BROADCAST_THROTTLE_MS = 80;

type CursorPoint = { x: number; y: number };

type ShapeUpsert = {
  id: TLShapeId;
  shape: JsonRectangle;
  updatedAt: number;
  updatedBy: string | null;
  action: "upsert";
};

type ShapeDelete = {
  id: TLShapeId;
  updatedAt: number;
  updatedBy: string | null;
  action: "delete";
};

type PendingDelta = ShapeUpsert | ShapeDelete;

type ImmutableShapeEntry = [string, ShapeMetadata];

function isCursorPoint(value: unknown): value is CursorPoint {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { x?: unknown }).x === "number" &&
    typeof (value as { y?: unknown }).y === "number"
  );
}

function isRectangle(shape: TLShape): shape is TLGeoShape {
  return shape.type === "geo" && shape.props.geo === "rectangle";
}

function shapeToJson(shape: TLGeoShape): JsonRectangle {
  return {
    id: shape.id,
    type: "geo",
    typeName: "shape",
    parentId: shape.parentId,
    index: shape.index,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation ?? 0,
    props: {
      w: shape.props.w,
      h: shape.props.h,
      fill: shape.props.fill ?? undefined,
      stroke: shape.props.color ?? undefined,
    },
  } satisfies JsonRectangle;
}

function jsonToPartial(json: JsonRectangle): TLShapePartial<TLGeoShape> {
  return {
    id: json.id as TLShapeId,
    type: "geo",
    parentId: json.parentId,
    index: json.index,
    x: json.x,
    y: json.y,
    rotation: json.rotation ?? 0,
    props: {
      geo: "rectangle",
      w: json.props.w,
      h: json.props.h,
      fill: json.props.fill ?? "none",
      color: json.props.stroke ?? "black",
      dash: "draw",
      size: "m",
      font: "draw",
      align: "middle",
      verticalAlign: "middle",
      labelColor: "black",
      growY: 0,
      scale: 1,
      url: "",
      richText: { type: "doc", content: [] },
    } satisfies TLGeoShapeProps,
  } satisfies TLShapePartial<TLGeoShape>;
}

export function Canvas() {
  const store = useMemo(() => createTLStore({ shapeUtils: defaultShapeUtils }), []);
  const editorRef = useRef<Editor | null>(null);
  const queueRef = useRef<Map<string, PendingDelta>>(new Map());
  const pendingLocalRef = useRef<Set<string>>(new Set());
  const shadowRef = useRef<Map<string, number>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();
  const status = useStatus();

  const [storageRoot] = useStorageRoot();
  const shapeEntries = useStorage((root) => {
    const map = (root as Record<string, unknown> | null)?.[STORAGE_MAP_KEY] as
      | ReadonlyMap<string, ShapeMetadata>
      | undefined;
    if (!map) {
      return [] as ImmutableShapeEntry[];
    }
    return Array.from(map.entries()) as ImmutableShapeEntry[];
  });

  useEffect(() => {
    if (!storageRoot) {
      return;
    }
    if (!storageRoot.get(STORAGE_MAP_KEY)) {
      storageRoot.set(STORAGE_MAP_KEY, new LiveMap<string, LiveObject<ShapeMetadata>>());
    }
  }, [storageRoot]);

  const flushPending = useMutation(
    ({ storage }) => {
      const pending = queueRef.current;
      if (pending.size === 0) {
        return;
      }

      let map = storage.get(STORAGE_MAP_KEY) as LiveMap<string, LiveObject<ShapeMetadata>> | null;
      if (!map) {
        map = new LiveMap<string, LiveObject<ShapeMetadata>>();
        storage.set(STORAGE_MAP_KEY, map);
      }

      pending.forEach((delta, id) => {
        if (delta.action === "delete") {
          map.delete(id);
          pendingLocalRef.current.delete(id);
          shadowRef.current.delete(id);
          return;
        }

        const record: ShapeMetadata = {
          shape: delta.shape,
          updatedAt: delta.updatedAt,
          updatedBy: delta.updatedBy,
        };

        const existing = map.get(id);
        if (!existing) {
          map.set(id, new LiveObject(record));
        } else {
          const currentUpdatedAt = existing.get("updatedAt") ?? 0;
          if (currentUpdatedAt > delta.updatedAt) {
            pendingLocalRef.current.delete(id);
            return;
          }
          existing.set("shape", record.shape as JsonRectangle);
          existing.set("updatedAt", record.updatedAt);
          existing.set("updatedBy", record.updatedBy);
        }

        pendingLocalRef.current.delete(id);
        shadowRef.current.set(id, delta.updatedAt);
      });

      pending.clear();
    },
    [],
  );

  const throttledFlush = useMemo(
    () =>
      throttle(() => {
        if (storageRoot) {
          flushPending();
        }
      }, BROADCAST_THROTTLE_MS, { leading: false, trailing: true }),
    [flushPending, storageRoot],
  );

  useEffect(() => {
    if (!storageRoot) {
      return;
    }
    if (queueRef.current.size === 0) {
      return;
    }
    throttledFlush.cancel();
    flushPending();
  }, [storageRoot, flushPending, throttledFlush]);

  useEffect(() => {
    return () => {
      throttledFlush.cancel();
      if (storageRoot && queueRef.current.size > 0) {
        flushPending();
      }
    };
  }, [storageRoot, throttledFlush, flushPending]);

  const queueDelta = useCallback(
    (delta: PendingDelta) => {
      queueRef.current.set(delta.id, delta);
      pendingLocalRef.current.add(delta.id);
      if (storageRoot) {
        throttledFlush();
      }
    },
    [storageRoot, throttledFlush],
  );

  useEffect(() => {
    updateMyPresence({ cursor: null });
  }, [updateMyPresence]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const dispose = editor.store.listen(
      ({ changes }: { changes: Snapshot<TLRecord> }) => {
        const now = Date.now();
        const updatedBy = user?.uid ?? null;

        Object.values(changes.added).forEach((record) => {
          if (record.typeName !== "shape") {
            return;
          }
          const shape = record as TLShape;
          if (!isRectangle(shape)) {
            return;
          }
          queueDelta({
            id: shape.id,
            shape: shapeToJson(shape),
            updatedAt: now,
            updatedBy,
            action: "upsert",
          });
        });

        Object.values(changes.updated).forEach(([_, next]) => {
          if (next.typeName !== "shape") {
            return;
          }
          const shape = next as TLShape;
          if (!isRectangle(shape)) {
            return;
          }
          queueDelta({
            id: shape.id,
            shape: shapeToJson(shape),
            updatedAt: now,
            updatedBy,
            action: "upsert",
          });
        });

        Object.values(changes.removed).forEach((record) => {
          if (record.typeName !== "shape") {
            return;
          }
          const shape = record as TLShape;
          if (!isRectangle(shape)) {
            return;
          }
          queueDelta({
            id: shape.id,
            updatedAt: now,
            updatedBy,
            action: "delete",
          });
        });
      },
      { scope: "document", source: "user" },
    );

    return () => dispose();
  }, [queueDelta, user?.uid]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const remoteById = new Map<string, ShapeMetadata>(shapeEntries);
    const seenIds = new Set<string>();

    remoteById.forEach((record, id) => {
      if (!record?.shape) {
        return;
      }

      seenIds.add(id);
      const { shape, updatedAt } = record;

      if (shadowRef.current.get(id) >= updatedAt) {
        return;
      }

      const partial = jsonToPartial(shape);

      editor.store.mergeRemoteChanges(() => {
        if (!editor.getShape(partial.id)) {
          editor.createShapes([partial]);
        } else {
          editor.updateShapes([partial]);
        }
      });

      shadowRef.current.set(id, updatedAt);
    });

    const currentIds = editor.getCurrentPageShapeIds();
    currentIds.forEach((shapeId) => {
      const id = shapeId as string;
      if (seenIds.has(id)) {
        return;
      }
      if (pendingLocalRef.current.has(id)) {
        return;
      }

      const shape = editor.getShape(shapeId);
      if (!shape || !isRectangle(shape)) {
        return;
      }

      editor.store.mergeRemoteChanges(() => {
        editor.deleteShapes([shapeId]);
      });
      shadowRef.current.delete(id);
    });
  }, [shapeEntries]);

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
      <Tldraw
        store={store}
        autoFocus
        hideUi={false}
        className="tldraw-theme-light"
        onMount={(editor) => {
          editorRef.current = editor;
        }}
      />
      <div className="pointer-events-none absolute inset-0">
        {others
          .map((other) => {
            const cursor = other.presence?.cursor;
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
                <div className="h-3 w-3 rotate-45 rounded-sm shadow-sm" style={{ backgroundColor: color }} />
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
      <div className="pointer-events-none absolute bottom-4 left-4 max-w-xs rounded-lg bg-background/90 px-4 py-2 text-xs font-medium text-muted-foreground shadow-sm">
        <p className="font-semibold text-foreground">Realtime sync</p>
        <p>Status: {status}</p>
      </div>
    </div>
  );
}

export default Canvas;

