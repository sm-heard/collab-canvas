import "server-only";

import { LiveMap, LiveObject, Liveblocks } from "@liveblocks/node";
import { nanoid } from "nanoid";

import type { AiToolParams, CanvasContextSummary, CanvasShapeSummary } from "@/lib/ai/types";
import type { JsonShape, ShapeMetadata } from "@/lib/schema";

const liveblocksSecret = process.env.LIVEBLOCKS_SECRET;

if (!liveblocksSecret) {
  console.warn("AI Commands: LIVEBLOCKS_SECRET is missing; mutations will fail.");
}

const liveblocks = liveblocksSecret ? new Liveblocks({ secret: liveblocksSecret }) : null;

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

async function mutateStorage(mutator: (root: StorageRoot) => void) {
  const client = assertLiveblocks();
  await client.mutateStorage(ROOM_ID, ({ root }) => {
    mutator(root as StorageRoot);
  });
}

const lockMap = new Map<string, number>();
const LOCK_TTL_MS = 5000;
const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 200;

function acquireLock(shapeId: string) {
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

async function withRetry(shapeIds: string[], mutator: (root: StorageRoot) => void) {
  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt += 1) {
    try {
      shapeIds.forEach(acquireLock);
      await mutateStorage(mutator);
      return;
    } catch (error) {
      const isLockError = error instanceof Error && error.message.includes("locked");
      if (!isLockError || attempt === MAX_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, BASE_RETRY_DELAY_MS * 2 ** attempt));
    } finally {
      shapeIds.forEach(releaseLock);
    }
  }
  throw new Error("Exceeded retry attempts for AI mutation.");
}

type StorageRoot = LiveObject<{
  shapes?: LiveMap<string, LiveObject<ShapeMetadata>>;
}>;

function getShapes(root: StorageRoot) {
  let shapes = root.get("shapes");
  if (!shapes) {
    shapes = new LiveMap<string, LiveObject<ShapeMetadata>>();
    root.set("shapes", shapes);
  }
  return shapes;
}

function normalizeShape(shape: JsonShape): JsonShape {
  const props = { ...(shape.props ?? {}) } as Record<string, unknown>;

  if (shape.type === "rect") {
    const { width: rawWidth, height: rawHeight, ...rest } = props;
    const width = typeof rawWidth === "number" ? rawWidth : 200;
    const height = typeof rawHeight === "number" ? rawHeight : 100;
    const color = normalizeColor(rest.color, "violet");
    const fill = typeof rest.fill === "string" ? rest.fill : "semi";
    return {
      ...shape,
      type: "geo",
      props: {
        geo: "rectangle",
        dash: "draw",
        url: "",
        growY: 0,
        scale: 1,
        labelColor: "black",
        color,
        fill,
        size: "m",
        font: "draw",
        align: "middle-legacy",
        verticalAlign: "middle",
        w: width,
        h: height,
        richText: createRichText(typeof rest.text === "string" ? rest.text : ""),
      },
      meta: {
        ...(shape.meta ?? {}),
        w: width,
        h: height,
      },
    } satisfies JsonShape;
  }

  if (shape.type === "triangle") {
    const { width: rawWidth, height: rawHeight, ...rest } = props;
    const width = typeof rawWidth === "number" ? rawWidth : 220;
    const height = typeof rawHeight === "number" ? rawHeight : 200;
    const color = normalizeColor(rest.color, "violet");
    const fill = typeof rest.fill === "string" ? rest.fill : "semi";
    return {
      ...shape,
      type: "geo",
      props: {
        geo: "triangle",
        dash: "draw",
        url: "",
        growY: 0,
        scale: 1,
        labelColor: "black",
        color,
        fill,
        size: "m",
        font: "draw",
        align: "middle-legacy",
        verticalAlign: "middle",
        w: width,
        h: height,
        richText: createRichText(typeof rest.text === "string" ? rest.text : ""),
      },
      meta: {
        ...(shape.meta ?? {}),
        w: width,
        h: height,
      },
    } satisfies JsonShape;
  }

  if (shape.type === "circle") {
    const defaultSize = 140;
    const { width: rawWidth, height: rawHeight, ...rest } = props;
    const width = typeof rawWidth === "number" ? rawWidth : defaultSize;
    const height = typeof rawHeight === "number" ? rawHeight : width;
    const color = normalizeColor(rest.color, "violet");
    const fill = typeof rest.fill === "string" ? rest.fill : "semi";
    return {
      ...shape,
      type: "geo",
      props: {
        geo: "ellipse",
        dash: "draw",
        url: "",
        growY: 0,
        scale: 1,
        labelColor: "black",
        color,
        fill,
        size: "m",
        font: "draw",
        align: "middle-legacy",
        verticalAlign: "middle",
        w: width,
        h: height,
        richText: createRichText(typeof rest.text === "string" ? rest.text : ""),
      },
      meta: {
        ...(shape.meta ?? {}),
        w: width,
        h: height,
      },
    } satisfies JsonShape;
  }

  if (shape.type === "text") {
    const fontSize = typeof props.fontSize === "number" ? props.fontSize : 16;
    const text = typeof props.text === "string" ? props.text : "";
    const color = normalizeColor(props.color, "black");
    const requestedAlign = typeof props.textAlign === "string" ? props.textAlign.toLowerCase() : "start";
    const textAlign: "start" | "end" | "middle" =
      requestedAlign === "center"
        ? "middle"
        : requestedAlign === "end" || requestedAlign === "right"
          ? "end"
          : "start";
    const width = typeof props.width === "number" ? props.width : Math.max(180, text.length * fontSize * 0.6 + 64);
    const sizeStyle = fontSize >= 26 ? "l" : fontSize <= 12 ? "s" : "m";
    return {
      ...shape,
      props: {
        color,
        size: sizeStyle,
        font: "draw",
        textAlign,
        w: width,
        richText: createRichText(text),
        scale: 1,
        autoSize: true,
      },
      meta: {
        ...(shape.meta ?? {}),
        size: fontSize,
      },
    } satisfies JsonShape;
  }

  return shape;
}

function ensureShapeId(id: string): string {
  return id.startsWith("shape:") ? id : `shape:${id}`;
}

export async function createShape(params: AiToolParams["createShape"], userId: string) {
  const now = Date.now();
  const commandId = nanoid();
  const baseShape = normalizeShape({
    id: ensureShapeId(params.id ?? `shape_${commandId}`),
    type: params.type,
    typeName: "shape",
    parentId: params.parentId ?? "page:page",
    index: params.index ?? "a1",
    x: params.x,
    y: params.y,
    rotation: params.rotation ?? 0,
    props: {
      width: params.width,
      height: params.height,
      color: params.color,
      text: params.text,
      fontSize: params.fontSize,
    },
  } as JsonShape);

  await mutateStorage((root) => {
    const shapes = getShapes(root);
    const metadata: ShapeMetadata = {
      shape: withAiMetadata(baseShape, userId, commandId, now),
      updatedAt: now,
      updatedBy: userId,
    };
    shapes.set(baseShape.id, new LiveObject(metadata));
  });
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
  const now = Date.now();
  const commandId = nanoid();

  // Fixed dimensions
  const formWidth = 320;
  const formHeight = 360;
  const padding = 24;
  const innerWidth = formWidth - padding * 2;
  const inputHeight = 44;
  
  // Absolute Y positions (measured from origin.y)
  const titleY = origin.y + 30;
  const userLabelY = origin.y + 80;
  const userFieldY = origin.y + 105;
  const passLabelY = origin.y + 165;
  const passFieldY = origin.y + 190;
  const buttonY = origin.y + 260;

  const shapes: JsonShape[] = [
    // Background container
    {
      id: ensureShapeId(`login_bg_${commandId}`),
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a1",
      x: origin.x,
      y: origin.y,
      rotation: 0,
      props: {
        width: formWidth,
        height: formHeight,
        color: "light-blue",
        fill: "solid",
      },
    },
    // Title
    {
      id: ensureShapeId(`login_title_${commandId}`),
      type: "text",
      typeName: "shape",
      parentId: "page:page",
      index: "a2",
      x: origin.x + padding,
      y: titleY,
      rotation: 0,
      props: {
        text: "Sign in",
        fontSize: 24,
        color: "black",
        textAlign: "start",
        width: innerWidth,
      },
    },
    // Username label
    {
      id: ensureShapeId(`login_label_user_${commandId}`),
      type: "text",
      typeName: "shape",
      parentId: "page:page",
      index: "a3",
      x: origin.x + padding,
      y: userLabelY,
      rotation: 0,
      props: {
        text: "Username",
        fontSize: 12,
        color: "grey",
        textAlign: "start",
        width: innerWidth,
      },
    },
    // Username input
    {
      id: ensureShapeId(`login_input_user_${commandId}`),
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a4",
      x: origin.x + padding,
      y: userFieldY,
      rotation: 0,
      props: {
        width: innerWidth,
        height: inputHeight,
        color: "grey",
        fill: "none",
      },
    },
    // Password label
    {
      id: ensureShapeId(`login_label_pass_${commandId}`),
      type: "text",
      typeName: "shape",
      parentId: "page:page",
      index: "a5",
      x: origin.x + padding,
      y: passLabelY,
      rotation: 0,
      props: {
        text: "Password",
        fontSize: 12,
        color: "grey",
        textAlign: "start",
        width: innerWidth,
      },
    },
    // Password input
    {
      id: ensureShapeId(`login_input_pass_${commandId}`),
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a6",
      x: origin.x + padding,
      y: passFieldY,
      rotation: 0,
      props: {
        width: innerWidth,
        height: inputHeight,
        color: "grey",
        fill: "none",
      },
    },
    // Submit button
    {
      id: ensureShapeId(`login_btn_${commandId}`),
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a7",
      x: origin.x + padding,
      y: buttonY,
      rotation: 0,
      props: {
        width: innerWidth,
        height: 48,
        color: "violet",
        fill: "solid",
        text: "Sign in",
      },
    },
  ] as JsonShape[];

  await mutateStorage((root) => {
    const shapesMap = getShapes(root);
    shapes.forEach((shape, index) => {
      const normalized = normalizeShape(shape);
      const metadata: ShapeMetadata = {
        shape: withAiMetadata({ ...normalized, index: `a${index}` }, userId, commandId, now),
        updatedAt: now,
        updatedBy: userId,
      };
      shapesMap.set(normalized.id, new LiveObject(metadata));
    });
  });

  return { shapeIds: shapes.map((shape) => normalizeShape(shape).id), commandId };
}

export async function createCompositeNavBar(
  userId: string,
  origin: { x: number; y: number },
  options: { width?: number } = {},
) {
  const now = Date.now();
  const commandId = nanoid();

  const width = options.width ?? 720;
  const height = 72;
  const paddingX = 32;
  const paddingY = 16;
  const buttonWidth = 132;
  const buttonHeight = 40;
  const navSpacing = 96;

  const shapes: JsonShape[] = [
    {
      id: ensureShapeId(`navbar_bg_${commandId}`),
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: "a1",
      x: origin.x,
      y: origin.y,
      rotation: 0,
      props: {
        width,
        height,
        color: "light-blue",
        fill: "solid",
      },
    },
    {
      id: ensureShapeId(`navbar_logo_${commandId}`),
      type: "text",
      typeName: "shape",
      parentId: "page:page",
      index: "a2",
      x: origin.x + paddingX,
      y: origin.y + paddingY - 4,
      rotation: 0,
      props: {
        text: "CollabCanvas",
        fontSize: 24,
        color: "black",
        textAlign: "start",
        width: 220,
      },
    },
  ];

  const navItems = ["Home", "Product", "Pricing", "About"];
  navItems.forEach((label, index) => {
    shapes.push({
      id: ensureShapeId(`navbar_item_${label.toLowerCase()}_${commandId}`),
      type: "text",
      typeName: "shape",
      parentId: "page:page",
      index: `a${index + 3}`,
      x: origin.x + paddingX + 240 + navSpacing * index,
      y: origin.y + paddingY + 6,
      rotation: 0,
      props: {
        text: label,
        fontSize: 14,
        color: "grey",
        textAlign: "start",
        width: 80,
      },
    });
  });

  shapes.push(
    {
      id: ensureShapeId(`navbar_cta_${commandId}`),
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: `a${navItems.length + 3}`,
      x: origin.x + width - paddingX - buttonWidth,
      y: origin.y + paddingY - 4,
      rotation: 0,
      props: {
        width: buttonWidth,
        height: buttonHeight,
        color: "violet",
        fill: "solid",
        text: "Get started",
      },
    },
    {
      id: ensureShapeId(`navbar_divider_${commandId}`),
      type: "rect",
      typeName: "shape",
      parentId: "page:page",
      index: `a${navItems.length + 4}`,
      x: origin.x,
      y: origin.y + height,
      rotation: 0,
      props: {
        width,
        height: 2,
        color: "grey",
        fill: "solid",
      },
    },
  );

  await mutateStorage((root) => {
    const shapesMap = getShapes(root);
    shapes.forEach((shape, index) => {
      const normalized = normalizeShape(shape);
      const metadata: ShapeMetadata = {
        shape: withAiMetadata({ ...normalized, index: `a${index}` }, userId, commandId, now),
        updatedAt: now,
        updatedBy: userId,
      };
      shapesMap.set(normalized.id, new LiveObject(metadata));
    });
  });

  return { shapeIds: shapes.map((shape) => normalizeShape(shape).id), commandId };
}

export async function moveShape(params: AiToolParams["moveShape"], userId: string) {
  return withRetry([params.shapeId], (root) => {
    const shapes = getShapes(root);
    const record = shapes.get(params.shapeId);
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

    const now = Date.now();
    const previous = record.toObject();
    const updated: ShapeMetadata = {
      ...previous,
      shape: {
        ...previous.shape,
        x: params.x,
        y: params.y,
        meta: {
          ...(previous.shape.meta ?? {}),
          source: "ai",
          aiCommandId: previous.shape.meta?.aiCommandId ?? nanoid(),
          updatedBy: userId,
          updatedAt: now,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    };
    record.update(updated);
  });
}

export async function resizeShape(params: AiToolParams["resizeShape"], userId: string) {
  return withRetry([params.shapeId], (root) => {
    const shapes = getShapes(root);
    const record = shapes.get(params.shapeId);
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

    const now = Date.now();
    const previous = record.toObject();
    const updated: ShapeMetadata = {
      ...previous,
      shape: {
        ...previous.shape,
        props: {
          ...previous.shape.props,
          w: params.width,
          h: params.height,
        },
        meta: {
          ...(previous.shape.meta ?? {}),
          source: "ai",
          aiCommandId: previous.shape.meta?.aiCommandId ?? nanoid(),
          updatedBy: userId,
          updatedAt: now,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    };
    record.update(updated);
  });
}

export async function rotateShape(params: AiToolParams["rotateShape"], userId: string) {
  return withRetry([params.shapeId], (root) => {
    const shapes = getShapes(root);
    const record = shapes.get(params.shapeId);
    if (!record) {
      throw new Error(`Shape ${params.shapeId} not found.`);
    }

    const now = Date.now();
    const previous = record.toObject();
    const updated: ShapeMetadata = {
      ...previous,
      shape: {
        ...previous.shape,
        rotation: params.degrees,
        meta: {
          ...(previous.shape.meta ?? {}),
          source: "ai",
          aiCommandId: previous.shape.meta?.aiCommandId ?? nanoid(),
          updatedBy: userId,
          updatedAt: now,
        },
      },
      updatedAt: now,
      updatedBy: userId,
    };
    record.update(updated);
  });
}

export async function arrangeLayout(params: AiToolParams["arrangeLayout"], userId: string) {
  return withRetry(params.shapeIds, (root) => {
    const shapes = getShapes(root);
    const now = Date.now();
    params.shapeIds.forEach((id) => {
      const record = shapes.get(id);
      if (!record) {
        throw new Error(`Shape ${id} not found.`);
      }
      const previous = record.toObject();
      const updated: ShapeMetadata = {
        ...previous,
        shape: {
          ...previous.shape,
          meta: {
            ...(previous.shape.meta ?? {}),
            source: "ai",
            aiCommandId: previous.shape.meta?.aiCommandId ?? nanoid(),
            layout: params.layout,
            updatedBy: userId,
            updatedAt: now,
          },
        },
        updatedAt: now,
        updatedBy: userId,
      };
      record.update(updated);
    });
  });
}

export async function getCanvasState(params: AiToolParams["getCanvasState"], userId: string) {
  const now = Date.now();
  const shapes: CanvasShapeSummary[] = [];

  await mutateStorage((root) => {
    const shapesMap = getShapes(root);
    shapesMap.forEach((record, id) => {
      const metadata = record.toObject();
      const shape = metadata.shape;
      if (!shape) return;
      shapes.push({
        id,
        type: shape.type,
        label: typeof (shape.props as { text?: string })?.text === "string" ? (shape.props as { text?: string }).text : undefined,
        color: (shape.props as { color?: string })?.color,
        position: { x: shape.x ?? 0, y: shape.y ?? 0 },
        size:
          typeof (shape.meta as { w?: number; h?: number })?.w === "number" &&
          typeof (shape.meta as { w?: number; h?: number })?.h === "number"
            ? { width: (shape.meta as { w?: number; h?: number }).w!, height: (shape.meta as { w?: number; h?: number }).h! }
            : undefined,
        rotation: shape.rotation,
        metadata: metadata.shape?.meta ?? {},
      });
    });
  });

  return {
    shapes: shapes.map((shape) => ({
      ...shape,
      size: shape.size
        ? { width: shape.size.width, height: shape.size.height }
        : undefined,
    })),
    totalShapes: shapes.length,
    snapshotAt: now,
    requestedBy: userId,
    minimal: params.minimal ?? false,
  } satisfies CanvasContextSummary & {
    snapshotAt: number;
    requestedBy: string;
    minimal: boolean;
  };
}

const ALLOWED_COLORS = new Set([
  "black",
  "grey",
  "light-violet",
  "violet",
  "blue",
  "light-blue",
  "yellow",
  "orange",
  "green",
  "light-green",
  "light-red",
  "red",
  "white",
]);

const LEGACY_COLOR_MAP: Record<string, string> = {
  "#4f46e5": "violet",
  "#f8fafc": "white",
  "#e5e7eb": "light-blue",
  "#ffffff": "white",
  "#1f2937": "black",
};

function normalizeColor(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    if (ALLOWED_COLORS.has(value)) {
      return value;
    }
    const mapped = LEGACY_COLOR_MAP[value.toLowerCase() as keyof typeof LEGACY_COLOR_MAP];
    if (mapped) {
      return mapped;
    }
  }
  return fallback;
}

function createRichText(text: string) {
  const lines = text.split("\n");
  const content = lines.map((line) => {
    if (!line) {
      return { type: "paragraph" };
    }
    return {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: line,
        },
      ],
    };
  });

  if (content.length === 0) {
    content.push({ type: "paragraph" });
  }

  return {
    type: "doc",
    content,
  };
}
