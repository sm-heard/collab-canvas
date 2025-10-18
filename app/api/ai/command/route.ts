import "server-only";

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";

import { adminAuth } from "../../../../lib/firebase-admin";
import {
  arrangeLayout,
  createCompositeLoginForm,
  createShape,
  moveShape,
  resizeShape,
  rotateShape,
} from "../../../../lib/ai/commands";
import type { AiToolName, AiToolParams } from "../../../../lib/ai/types";

function describeCommand(name: AiToolName) {
  switch (name) {
    case "createShape":
      return "Creating shape";
    case "moveShape":
      return "Moving shape";
    case "resizeShape":
      return "Resizing shape";
    case "rotateShape":
      return "Rotating shape";
    case "arrangeLayout":
      return "Arranging layout";
    case "groupShapes":
      return "Grouping shapes";
    case "getCanvasState":
      return "Reading canvas state";
    default:
      return "Executing command";
  }
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Authorization header." }, { status: 401 });
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    return NextResponse.json({ error: "Invalid Authorization header." }, { status: 401 });
  }

  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid or expired Firebase token." }, { status: 401 });
  }

  let payload: {
    prompt?: string;
    commandId?: string;
    tool?: AiToolName;
    params?: unknown;
    composite?: "loginForm" | "navBar" | "card";
    origin?: { x: number; y: number };
  } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const prompt = payload.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const streamId = nanoid();
  const start = Date.now();

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`event: init\ndata: ${JSON.stringify({ streamId, prompt })}\n\n`),
      );

      try {
        let result: unknown = null;
        if (payload.composite === "loginForm") {
          controller.enqueue(
            encoder.encode(
              `event: progress\ndata: ${JSON.stringify({ streamId, status: "running", message: "Creating login form layout…" })}\n\n`,
            ),
          );
          result = await createCompositeLoginForm(decoded.uid, payload.origin ?? { x: 200, y: 200 });
        } else if (payload.tool && payload.params) {
          controller.enqueue(
            encoder.encode(
              `event: progress\ndata: ${JSON.stringify({ streamId, status: "running", message: describeCommand(payload.tool) })}\n\n`,
            ),
          );

          switch (payload.tool) {
            case "createShape":
              result = await createShape(payload.params as AiToolParams["createShape"], decoded.uid);
              break;
            case "moveShape":
              result = await moveShape(payload.params as AiToolParams["moveShape"], decoded.uid);
              break;
            case "resizeShape":
              result = await resizeShape(payload.params as AiToolParams["resizeShape"], decoded.uid);
              break;
            case "rotateShape":
              result = await rotateShape(payload.params as AiToolParams["rotateShape"], decoded.uid);
              break;
            case "arrangeLayout":
              result = await arrangeLayout(payload.params as AiToolParams["arrangeLayout"], decoded.uid);
              break;
            case "getCanvasState":
              result = { shapes: [] };
              break;
            case "groupShapes":
              throw new Error("groupShapes is not yet implemented");
            default:
              throw new Error(`Unsupported tool: ${payload.tool satisfies never}`);
          }
        } else {
          controller.enqueue(
            encoder.encode(
              `event: progress\ndata: ${JSON.stringify({ streamId, status: "thinking", message: "No actionable steps; skipping." })}\n\n`,
            ),
          );
        }

        const durationMs = Date.now() - start;
        controller.enqueue(
          encoder.encode(
            `event: summary\ndata: ${JSON.stringify({ streamId, status: "success", durationMs, result })}\n\n`,
          ),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI command failed.";
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ streamId, status: "error", message })}\n\n`,
          ),
        );
      } finally {
        controller.enqueue(encoder.encode("event: close\n\n"));
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
