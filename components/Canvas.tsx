"use client";

import "@tldraw/tldraw/tldraw.css";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { LiveMap, LiveObject } from "@liveblocks/client";
import {
  useMutation,
  useOthers,
  useStorage,
  useStorageRoot,
  useUpdateMyPresence,
} from "@liveblocks/react";
import {
  getIndexAbove,
  TLParentId,
  TLRecord,
  TLShape,
  TLShapeId,
  TLShapePartial,
  TLUnknownShape,
  Tldraw,
  createTLStore,
  defaultShapeUtils,
  Editor,
} from "@tldraw/tldraw";
import type { RecordsDiff } from "@tldraw/store";
import throttle from "lodash/throttle";
import { colorFromUserId, getContrastColor } from "@/lib/colors";
import type { JsonShape, ShapeMetadata } from "@/lib/schema";
import { useAuth } from "@/hooks/useAuth";
import { useSnapshotIdleEffect } from "@/hooks/useSnapshotIdleEffect";

const STORAGE_MAP_KEY = "shapes";
const BROADCAST_THROTTLE_MS = 80;

type CursorPoint = { x: number; y: number };

type ShapeUpsert = {
  id: TLShapeId;
  shape: JsonShape;
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

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeProps(json: JsonShape): Record<string, unknown> {
  const props = { ...(json.props ?? {}) } as Record<string, unknown>;

  if (json.type === "geo") {
    const stroke = props.stroke;
    if (typeof stroke === "string" && props.color === undefined) {
      props.color = stroke;
    }
    delete props.stroke;

    const width = props.width;
    const height = props.height;
    if (props.w === undefined && typeof width === "number") {
      props.w = width;
    }
    if (props.h === undefined && typeof height === "number") {
      props.h = height;
    }
    delete props.width;
    delete props.height;
  }

  return props;
}

function shapeToJson(shape: TLShape): JsonShape {
  const parentId = (shape.parentId ?? "page:page") as TLParentId;
  const indexValue = shape.index ?? getIndexAbove();
  const index = typeof indexValue === "string" ? indexValue : String(indexValue);

  const { id, typeName, type } = shape;

  return {
    id,
    typeName,
    type,
    parentId,
    index,
    x: shape.x,
    y: shape.y,
    rotation: shape.rotation ?? 0,
    props: cloneValue(shape.props ?? {}),
    meta: cloneValue(shape.meta ?? {}),
  } satisfies JsonShape;
}

function jsonToPartial(json: JsonShape): TLShapePartial<TLUnknownShape> {
  const parentId = (json.parentId ?? "page:page") as TLParentId;
  const indexValue = (json.index as TLShapePartial<TLShape>["index"]) ?? getIndexAbove();
  const props = sanitizeProps(json) as TLShapePartial<TLUnknownShape>["props"];
  const meta = cloneValue(json.meta ?? {}) as TLShapePartial<TLUnknownShape>["meta"];

  return {
    id: json.id as TLShapeId,
    type: json.type,
    typeName: json.typeName,
    parentId,
    index: indexValue,
    x: json.x,
    y: json.y,
    rotation: json.rotation ?? 0,
    props,
    meta,
  } satisfies TLShapePartial<TLUnknownShape>;
}

export function Canvas() {
  const store = useMemo(() => createTLStore({ shapeUtils: defaultShapeUtils }), []);
  const editorRef = useRef<Editor | null>(null);
  const queueRef = useRef<Map<string, PendingDelta>>(new Map());
  const pendingLocalRef = useRef<Set<string>>(new Set());
  const shadowRef = useRef<Map<string, number>>(new Map());
  const latestRemoteUpdateRef = useRef<number>(0);
  const latestAiUpdateRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { user } = useAuth();
  const others = useOthers();
  const updateMyPresence = useUpdateMyPresence();

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

  useSnapshotIdleEffect(latestAiUpdateRef.current);

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
          existing.set("shape", record.shape as JsonShape);
          existing.set("updatedAt", record.updatedAt);
          existing.set("updatedBy", record.updatedBy);
        }

        pendingLocalRef.current.delete(id);
        shadowRef.current.set(id, delta.updatedAt);
        latestRemoteUpdateRef.current = Math.max(latestRemoteUpdateRef.current, delta.updatedAt);
        if (record.updatedBy) {
          latestAiUpdateRef.current = delta.updatedAt;
        }
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
      if (storageRoot) {
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
      ({ changes }: { changes: RecordsDiff<TLRecord> }) => {
        const now = Date.now();
        const updatedBy = user?.uid ?? null;

        const addedRecords = Object.values(changes.added ?? {}) as TLRecord[];
        addedRecords.forEach((record) => {
          if (record.typeName !== "shape") {
            return;
          }
          const shape = record as TLShape;
          queueDelta({
            id: shape.id,
            shape: shapeToJson(shape),
            updatedAt: now,
            updatedBy,
            action: "upsert",
          });
        });

        const updatedRecords = Object.values(changes.updated ?? {}) as [TLRecord, TLRecord][];
        updatedRecords.forEach(([, next]) => {
          if (next.typeName !== "shape") {
            return;
          }
          const shape = next as TLShape;
          queueDelta({
            id: shape.id,
            shape: shapeToJson(shape),
            updatedAt: now,
            updatedBy,
            action: "upsert",
          });
        });

        const removedRecords = Object.values(changes.removed ?? {}) as TLRecord[];
        removedRecords.forEach((record) => {
          if (record.typeName !== "shape") {
            return;
          }
          const shape = record as TLShape;
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

      if ((shadowRef.current.get(id) ?? 0) >= updatedAt) {
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
      latestRemoteUpdateRef.current = Math.max(latestRemoteUpdateRef.current, updatedAt);
      if (record.updatedBy) {
        latestAiUpdateRef.current = updatedAt;
      }
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
      if (!shape) {
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
      className="relative flex h-full w-full flex-1 overflow-hidden rounded-2xl border border-border/80 bg-background shadow-inner"
      onPointerMove={handlePointerMove}
      onPointerLeave={clearCursor}
      onPointerUp={clearCursor}
    >
      <Tldraw
      licenseKey={process.env.NEXT_PUBLIC_TLDRAW_LICENSE_KEY}
        store={store}
        autoFocus
        hideUi={false}
        className="tldraw-theme-light"
        components={{
          PageMenu: () => null,
        }}
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
    </div>
  );
}

export default Canvas;

