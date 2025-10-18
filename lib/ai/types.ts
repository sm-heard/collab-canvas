export type AiCommandStatus = "idle" | "thinking" | "running" | "success" | "error";

export type AiToolName =
  | "getCanvasState"
  | "createShape"
  | "moveShape"
  | "resizeShape"
  | "rotateShape"
  | "arrangeLayout"
  | "groupShapes";

export interface AiCommandRequest {
  prompt: string;
  userId: string;
  selection?: string[];
  contextSummary?: CanvasContextSummary;
}

export interface AiToolCall<TName extends AiToolName = AiToolName, TParams = AiToolParams[TName]> {
  id: string;
  name: TName;
  params: TParams;
}

export type AiToolResult = {
  success: boolean;
  error?: string;
  shapeIdsAffected?: string[];
};

export interface AiCommandStep {
  toolCall: AiToolCall;
  result?: AiToolResult;
}

export interface AiCommandStreamEvent {
  type: "progress" | "summary" | "error";
  status: AiCommandStatus;
  message?: string;
  step?: AiCommandStep;
  summary?: AiCommandSummary;
}

export interface AiCommandSummary {
  commandId: string;
  prompt: string;
  status: AiCommandStatus;
  steps: AiCommandStep[];
  durationMs?: number;
}

export interface CanvasContextSummary {
  shapes: CanvasShapeSummary[];
  selection?: string[];
  totalShapes: number;
}

export interface CanvasShapeSummary {
  id: string;
  type: string;
  label?: string;
  color?: string;
  position: { x: number; y: number };
  size?: { width: number; height: number };
  rotation?: number;
  metadata?: Record<string, unknown>;
}

export type AiToolParams = {
  getCanvasState: { minimal?: boolean };
  createShape: {
    id?: string;
    parentId?: string;
    index?: string;
    type: "rect" | "circle" | "text" | "group";
    x: number;
    y: number;
    width?: number;
    height?: number;
    text?: string;
    color?: string;
    rotation?: number;
    fontSize?: number;
  };
  moveShape: {
    shapeId: string;
    x: number;
    y: number;
  };
  resizeShape: {
    shapeId: string;
    width: number;
    height: number;
  };
  rotateShape: {
    shapeId: string;
    degrees: number;
  };
  arrangeLayout: {
    shapeIds: string[];
    layout: "grid" | "row" | "column" | "distribute";
    rows?: number;
    columns?: number;
    spacing?: number;
  };
  groupShapes: {
    shapeIds: string[];
    name?: string;
  };
};

export const DEFAULT_AI_MODEL = process.env.AI_MODEL ?? "gpt-4.1-mini";
export const DEFAULT_AI_RESPONSE_TIMEOUT_MS = Number(process.env.AI_RESPONSE_TIMEOUT_MS ?? 5000);
