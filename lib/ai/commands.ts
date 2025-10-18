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

export async function createShape(params: AiToolParams["createShape"], userId: string) {
  const client = assertLiveblocks();
  const commandId = nanoid();
  const now = Date.now();
  const shape: JsonShape = {
    id: params.id ?? `shape_${commandId}`,
    type: params.type,
    typeName: "shape",
    parentId: params.parentId ?? "page:page",
    index: params.index ?? "a1",
    x: params.x,
    y: params.y,
    rotation: params.rotation ?? 0,
    props: {
      width: params.width ?? 200,
      height: params.height ?? 100,
      color: params.color ?? "#4f46e5",
      text: params.text,
      fontSize: params.fontSize ?? 16,
    },
    meta: {
      source: "ai",
      aiCommandId: commandId,
      createdBy: userId,
      createdAt: now,
    },
  } as JsonShape;

  const metadata: ShapeMetadata = {
    shape,
    updatedAt: now,
    updatedBy: userId,
  };

  await client.updateRoomStorage(ROOM_ID, ({ set }) => {
    set(["shapes", shape.id], metadata);
  });

  return { id: shape.id, commandId };
}

export async function moveShape(params: AiToolParams["moveShape"], userId: string) {
  const client = assertLiveblocks();
  const now = Date.now();
  await client.updateRoomStorage(ROOM_ID, ({ get, set }) => {
    const record = get(["shapes", params.shapeId]) as ShapeMetadata | undefined;
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

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
  const client = assertLiveblocks();
  const now = Date.now();
  await client.updateRoomStorage(ROOM_ID, ({ get, set }) => {
    const record = get(["shapes", params.shapeId]) as ShapeMetadata | undefined;
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

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
  const client = assertLiveblocks();
  const now = Date.now();
  await client.updateRoomStorage(ROOM_ID, ({ get, set }) => {
    const record = get(["shapes", params.shapeId]) as ShapeMetadata | undefined;
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

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
  const client = assertLiveblocks();
  const now = Date.now();
  await client.updateRoomStorage(ROOM_ID, ({ get, set }) => {
    const records = params.shapeIds
      .map((id) => {
        const record = get(["shapes", id]) as ShapeMetadata | undefined;
        if (!record) {
          throw new Error(`Shape ${id} not found.`);
        }
        return record;
      })
      .filter(Boolean);

    records.forEach((record, index) => {
      const targetId = params.shapeIds[index];
      if (!targetId) return;
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
      set(["shapes", targetId], updated);
    });
  });
}
