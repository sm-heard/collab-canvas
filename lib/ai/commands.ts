import "server-only";

import { Liveblocks } from "@liveblocks/node";
import { nanoid } from "nanoid";

import type { AiToolParams } from "@/lib/ai/types";
import type { JsonShape, ShapeMetadata } from "@/lib/schema";

const LIVEBLOCKS_SECRET = process.env.LIVEBLOCKS_SECRET;

if (!LIVEBLOCKS_SECRET) {
  console.warn("AI Commands: LIVEBLOCKS_SECRET is missing; mutations will fail.");
}

const liveblocks = LIVEBLOCKS_SECRET ? new Liveblocks({ secret: LIVEBLOCKS_SECRET }) : null;

function assertLiveblocks() {
  if (!liveblocks) {
    throw new Error("Liveblocks is not configured on the server.");
  }
  return liveblocks;
}

const ROOM_ID = "rooms/default";

function withAiMetadata(shape: JsonShape, userId: string, commandId: string, now: number): JsonShape {
  return {
    ...shape,
    meta: {
      ...(shape.meta ?? {}),
      source: "ai",
      aiCommandId: commandId,
      updatedBy: userId,
      updatedAt: now,
    },
  } as JsonShape;
}

async function setShape(shape: JsonShape, userId: string, commandId: string, now: number) {
  const client = assertLiveblocks();
  const metadata: ShapeMetadata = {
    shape: withAiMetadata(shape, userId, commandId, now),
    updatedAt: now,
    updatedBy: userId,
  };

  await client.updateRoomStorage(ROOM_ID, ({ set, getUndoManager }) => {
    const undoManager = getUndoManager?.();
    undoManager?.batch(() => {
      set(["shapes", shape.id], metadata);
    });
  });
}

const lockMap = new Map<string, number>();
const LOCK_TTL_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 200;

function acquireLock(shapeId: string, userId: string) {
  const now = Date.now();
  const expiresAt = lockMap.get(shapeId);
  if (expiresAt && expiresAt > now) {
    throw new Error(`Shape ${shapeId} is locked by another operation.`);
  }
  lockMap.set(shapeId, now + LOCK_TTL_MS);
}

function releaseLock(shapeId: string) {
  lockMap.delete(shapeId);
}

async function withUndo<T>(shapeIds: string[], userId: string, fn: () => Promise<T>): Promise<T> {
  const client = assertLiveblocks();
  return client.updateRoomStorage(ROOM_ID, async (ctx) => {
    const undoManager = ctx.getUndoManager?.();
    undoManager?.batchStart();
    try {
      const result = await fn();
      undoManager?.batchEnd();
      return result;
    } catch (error) {
      undoManager?.batchEnd();
      throw error;
    }
  });
}

async function withRetryAndUndo<T>(shapeIds: string[], userId: string, fn: (ctx: Parameters<Liveblocks["updateRoomStorage"]>[1]) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      shapeIds.forEach((id) => acquireLock(id, userId));
      return await withUndo(shapeIds, userId, async () => {
        const client = assertLiveblocks();
        return client.updateRoomStorage(ROOM_ID, async (ctx) => {
          const undoManager = ctx.getUndoManager?.();
          undoManager?.batchStart();
          try {
            const result = await fn(ctx);
            undoManager?.batchEnd();
            return result;
          } catch (error) {
            undoManager?.batchEnd();
            throw error;
          }
        });
      });
    } catch (error) {
      const isLockError = error instanceof Error && error.message.includes("locked");
      if (!isLockError || attempt === MAX_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      const delay = BASE_RETRY_DELAY_MS * 2 ** attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    } finally {
      shapeIds.forEach((id) => releaseLock(id));
    }
  }
  throw new Error("Exceeded retry attempts for AI mutation.");
}

export async function createShape(params: AiToolParams["createShape"], userId: string) {
  const now = Date.now();
  const commandId = nanoid();
  const baseShape: JsonShape = {
    id: params.id ?? `shape_${commandId}`,
    type: params.type,
    typeName: "shape",
    parentId: params.parentId ?? "page:page",
    index: params.index ?? "a1",
    x: params.x,
    y: params.y,
    rotation: params.rotation ?? 0,
    props: {
      width: params.width ?? (params.type === "circle" ? 140 : 200),
      height: params.height ?? (params.type === "circle" ? 140 : 100),
      color: params.color ?? "#4f46e5",
      text: params.text,
      fontSize: params.fontSize ?? 16,
    },
  } as JsonShape;

  await setShape(baseShape, userId, commandId, now);
  return { id: baseShape.id, commandId };
}

export async function createTextShape(
  params: Omit<AiToolParams["createShape"], "type"> & { text: string; fontSize?: number },
  userId: string,
) {
  return createShape({ ...params, type: "text" }, userId);
}

export async function createCircle(
  params: Omit<AiToolParams["createShape"], "type">,
  userId: string,
) {
  return createShape({ ...params, type: "circle" }, userId);
}

export async function createCompositeLoginForm(userId: string, origin: { x: number; y: number }) {
  const spacing = 24;
  const fieldHeight = 48;
  const labelHeight = 20;
  const buttonHeight = 48;
  const width = 320;
  const now = Date.now();
  const commandId = nanoid();

  const shapes: JsonShape[] = [
    {
      id: `login_container_${commandId}`,
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a1",
      x: origin.x,
      y: origin.y,
      rotation: 0,
      props: {
        width,
        height: fieldHeight * 2 + buttonHeight + spacing * 3 + labelHeight * 2,
        color: "#f8fafc",
      },
    },
    {
      id: `login_label_user_${commandId}`,
      type: "text",
      typeName: "shape",
      parentId: "page:page",
      index: "a2",
      x: origin.x + 24,
      y: origin.y + 24,
      props: {
        text: "Username",
        fontSize: 14,
        color: "#1f2937",
      },
    },
    {
      id: `login_field_user_${commandId}`,
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a3",
      x: origin.x + 24,
      y: origin.y + 24 + labelHeight + 4,
      props: {
        width: width - 48,
        height: fieldHeight,
        color: "#e5e7eb",
      },
    },
    {
      id: `login_label_pass_${commandId}`,
      type: "text",
      typeName: "shape",
      parentId: "page:page",
      index: "a4",
      x: origin.x + 24,
      y: origin.y + 24 + labelHeight + fieldHeight + spacing,
      props: {
        text: "Password",
        fontSize: 14,
        color: "#1f2937",
      },
    },
    {
      id: `login_field_pass_${commandId}`,
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a5",
      x: origin.x + 24,
      y: origin.y + 24 + (labelHeight + fieldHeight) * 2 + spacing,
      props: {
        width: width - 48,
        height: fieldHeight,
        color: "#e5e7eb",
      },
    },
    {
      id: `login_button_${commandId}`,
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a6",
      x: origin.x + 24,
      y: origin.y + 24 + (labelHeight + fieldHeight) * 2 + spacing * 2 + buttonHeight,
      props: {
        width: width - 48,
        height: buttonHeight,
        color: "#4f46e5",
      },
    },
    {
      id: `login_button_text_${commandId}`,
      type: "text",
      typeName: "shape",
      parentId: "page:page",
      index: "a7",
      x: origin.x + width / 2,
      y: origin.y + 24 + (labelHeight + fieldHeight) * 2 + spacing * 2 + buttonHeight + 12,
      props: {
        text: "Sign in",
        fontSize: 16,
        color: "#ffffff",
      },
    },
  ] as JsonShape[];

  const client = assertLiveblocks();
  await client.updateRoomStorage(ROOM_ID, ({ set }) => {
    shapes.forEach((shape, index) => {
      const metadata: ShapeMetadata = {
        shape: withAiMetadata({ ...shape, index: `a${index}` }, userId, commandId, now),
        updatedAt: now,
        updatedBy: userId,
      };
      set(["shapes", shape.id], metadata);
    });
  });

  return { shapeIds: shapes.map((shape) => shape.id), commandId };
}

export async function moveShape(params: AiToolParams["moveShape"], userId: string) {
  return withRetryAndUndo([params.shapeId], userId, async ({ get, set }) => {
    const record = get(["shapes", params.shapeId]) as ShapeMetadata | undefined;
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

    const now = Date.now();
    const updated: ShapeMetadata = {
      ...record,
      shape: {
        ...record.shape,
        x: params.x,
        y: params.y,
        meta: {
          ...(record.shape.meta ?? {}),
          source: "ai",
          aiCommandId: record.shape.meta?.aiCommandId ?? nanoid(),
          updatedBy: userId,
          updatedAt: now,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    };
    set(["shapes", params.shapeId], updated);
  });
}

export async function resizeShape(params: AiToolParams["resizeShape"], userId: string) {
  return withRetryAndUndo([params.shapeId], userId, async ({ get, set }) => {
    const record = get(["shapes", params.shapeId]) as ShapeMetadata | undefined;
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

    const now = Date.now();
    const updated: ShapeMetadata = {
      ...record,
      shape: {
        ...record.shape,
        props: {
          ...record.shape.props,
          width: params.width,
          height: params.height,
        },
        meta: {
          ...(record.shape.meta ?? {}),
          source: "ai",
          aiCommandId: record.shape.meta?.aiCommandId ?? nanoid(),
          updatedBy: userId,
          updatedAt: now,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    };
    set(["shapes", params.shapeId], updated);
  });
}

export async function rotateShape(params: AiToolParams["rotateShape"], userId: string) {
  return withRetryAndUndo([params.shapeId], userId, async ({ get, set }) => {
    const record = get(["shapes", params.shapeId]) as ShapeMetadata | undefined;
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

    const now = Date.now();
    const updated: ShapeMetadata = {
      ...record,
      shape: {
        ...record.shape,
        rotation: params.degrees,
        meta: {
          ...(record.shape.meta ?? {}),
          source: "ai",
          aiCommandId: record.shape.meta?.aiCommandId ?? nanoid(),
          updatedBy: userId,
          updatedAt: now,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    };
    set(["shapes", params.shapeId], updated);
  });
}

export async function arrangeLayout(params: AiToolParams["arrangeLayout"], userId: string) {
  return withRetryAndUndo(params.shapeIds, userId, async ({ get, set }) => {
    const now = Date.now();
    params.shapeIds.forEach((id, index) => {
      const record = get(["shapes", id]) as ShapeMetadata | undefined;
      if (!record) {
        throw new Error(`Shape ${id} not found.`);
      }
      const updated: ShapeMetadata = {
        ...record,
        shape: {
          ...record.shape,
          meta: {
            ...(record.shape.meta ?? {}),
            source: "ai",
            aiCommandId: record.shape.meta?.aiCommandId ?? nanoid(),
            layout: params.layout,
            updatedBy: userId,
            updatedAt: now,
          },
        },
        updatedAt: now,
        updatedBy: userId,
      };
      set(["shapes", id], updated);
    });
  });
}
