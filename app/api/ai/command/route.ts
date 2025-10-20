import "server-only";

import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { stepCountIs, streamText, tool } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import { z } from "zod";

import { adminAuth } from "../../../../lib/firebase-admin";
import {
  arrangeLayout,
  createCompositeLoginForm,
  createCompositeNavBar,
  createShape,
  getCanvasState,
  moveShape,
  resizeShape,
  rotateShape,
} from "../../../../lib/ai/commands";
import type { AiToolParams } from "../../../../lib/ai/types";

const openai = createOpenAI({ apiKey: process.env.AI_API_KEY });

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
    composite?: "loginForm" | "navBar";
    origin?: { x: number; y: number };
    width?: number;
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

  const streamId = nanoid();

  const encoder = new TextEncoder();
  const sendSse = (controller: ReadableStreamDefaultController<Uint8Array>, event: string, data?: Record<string, unknown>) => {
    const payload = data === undefined ? "" : `data: ${JSON.stringify(data)}\n`;
    controller.enqueue(encoder.encode(`event: ${event}\n${payload}\n`));
  };

  if (payload.composite === "loginForm" || payload.composite === "navBar") {
    const origin = payload.origin ?? { x: 200, y: 200 };
    const command = payload.composite === "loginForm"
      ? async () => createCompositeLoginForm(decoded.uid, origin)
      : async () => createCompositeNavBar(decoded.uid, origin, { width: payload.width });

    return new Response(
      new ReadableStream({
        async start(controller) {
          sendSse(controller, "init", { streamId, prompt });
          sendSse(controller, "progress", {
            streamId,
            status: "running",
            message: payload.composite === "loginForm" ? "Creating login form layout…" : "Creating navigation bar…",
          });

          try {
            const result = await command();
            sendSse(controller, "summary", {
              streamId,
              status: "success",
              durationMs: 0,
              result,
            });
          } catch (error) {
            sendSse(controller, "error", {
              streamId,
              status: "error",
              message: error instanceof Error ? error.message : String(error),
            });
          } finally {
            sendSse(controller, "close");
            controller.close();
          }
        },
      }),
      {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      },
    );
  }

  const tools = {
    getCanvasState: tool({
      description: "Inspect current shapes and metadata on the canvas",
      inputSchema: z.object({ minimal: z.boolean().optional() }),
      execute: async (args: AiToolParams["getCanvasState"]) => getCanvasState(args, decoded.uid),
    }),
    createShape: tool({
      description: "Create a new tldraw-compatible shape",
      inputSchema: z.object({
        id: z.string().optional(),
        parentId: z.string().optional(),
        index: z.string().optional(),
        type: z.enum(["rect", "circle", "text", "group", "triangle"]),
        x: z.number(),
        y: z.number(),
        width: z.number().optional(),
        height: z.number().optional(),
        text: z.string().optional(),
        color: z.string().optional(),
        rotation: z.number().optional(),
        fontSize: z.number().optional(),
      }),
      execute: async (args: AiToolParams["createShape"]) => createShape(args, decoded.uid),
    }),
    moveShape: tool({
      description: "Move a shape to x/y",
      inputSchema: z.object({ shapeId: z.string(), x: z.number(), y: z.number() }),
      execute: async (args: AiToolParams["moveShape"]) => moveShape(args, decoded.uid),
    }),
    resizeShape: tool({
      description: "Resize a shape to width/height",
      inputSchema: z.object({ shapeId: z.string(), width: z.number(), height: z.number() }),
      execute: async (args: AiToolParams["resizeShape"]) => resizeShape(args, decoded.uid),
    }),
    rotateShape: tool({
      description: "Rotate a shape",
      inputSchema: z.object({ shapeId: z.string(), degrees: z.number() }),
      execute: async (args: AiToolParams["rotateShape"]) => rotateShape(args, decoded.uid),
    }),
    arrangeLayout: tool({
      description: "Arrange a group of shapes",
      inputSchema: z.object({
        shapeIds: z.array(z.string()),
        layout: z.enum(["grid", "row", "column", "distribute"]),
        rows: z.number().optional(),
        columns: z.number().optional(),
        spacing: z.number().optional(),
      }),
      execute: async (args: AiToolParams["arrangeLayout"]) => arrangeLayout(args, decoded.uid),
    }),
    createCompositeLoginForm: tool({
      description: "Create a multi-element login form",
      inputSchema: z.object({ origin: z.object({ x: z.number(), y: z.number() }).optional() }),
      execute: async ({ origin }: { origin?: { x: number; y: number } }) =>
        createCompositeLoginForm(decoded.uid, origin ?? { x: 200, y: 200 }),
    }),
    createCompositeNavBar: tool({
      description: "Create a navigation bar layout",
      inputSchema: z.object({
        origin: z.object({ x: z.number(), y: z.number() }).optional(),
        width: z.number().optional(),
      }),
      execute: async ({ origin, width }: { origin?: { x: number; y: number }; width?: number }) =>
        createCompositeNavBar(decoded.uid, origin ?? { x: 160, y: 160 }, { width }),
    }),
  } as const;

  const startedAt = Date.now();

  const body = new ReadableStream({
    async start(controller) {
      const send = (event: string, data?: Record<string, unknown>) => sendSse(controller, event, data);

      send("init", { streamId, prompt });

      let summarySent = false;

      try {
        const stream = await streamText({
          model: openai(process.env.AI_MODEL ?? "gpt-4.1-mini"),
          toolChoice: "required",
          stopWhen: [stepCountIs(2)],
          messages: [
            {
              role: "system",
              content: `You are the CollabCanvas AI assistant running in a shared design canvas.\n\nRules:\n1. ALWAYS satisfy the user's request by issuing the necessary tool calls. Plain text responses are forbidden.\n2. Before acting on existing shapes, call "getCanvasState" so you can match IDs by color, label, position, or selection metadata.\n3. After inspecting the canvas, execute mutation tools only when they are required to fulfill the request. If the desired result has already been achieved (for example, the new shape was just created in the requested style), you may finish immediately without further mutations.\n4. Never loop: avoid calling the same mutation tool repeatedly when the canvas already matches the specification.\n5. Treat any numeric dimensions as pixels; convert units like “px” or “pt” to numbers. Provide absolute x/y coordinates in pixels relative to the canvas origin.\n6. Colors must come from: black, grey, light-violet, violet, blue, light-blue, yellow, orange, green, light-green, light-red, red, white.\n7. Layout commands should call arrangeLayout with appropriate spacing/rows/columns, using the current selection when relevant.\n8. Mutation tools require a shapeId that exists. If you cannot uniquely identify a shape, call getCanvasState again or raise a meaningful error via tool output.\n9. Once the change is applied (or you return an error), finish without emitting additional assistant text.\n\nAvailable tools: getCanvasState (inspect), createShape (create new tldraw shape), moveShape (move existing), resizeShape (resize existing), rotateShape (rotate existing), arrangeLayout (grid/row/column/distribute groups), createCompositeLoginForm, createCompositeNavBar.`,
            },
            { role: "user", content: prompt },
          ],
          tools,
          onChunk: async ({ chunk }) => {
            switch (chunk.type) {
              case "text-delta": {
                const message = typeof chunk.text === "string" ? chunk.text.trim() : "";
                if (message) {
                  send("progress", { streamId, status: "running", message });
                }
                break;
              }
              case "tool-call": {
                send("progress", {
                  streamId,
                  status: "running",
                  message: `Calling ${chunk.toolName}`,
                  tool: {
                    id: chunk.toolCallId,
                    name: chunk.toolName,
                    input: chunk.input,
                  },
                });
                break;
              }
              case "tool-result": {
                send("progress", {
                  streamId,
                  status: "running",
                  message: `Finished ${chunk.toolName}`,
                  tool: {
                    id: chunk.toolCallId,
                    name: chunk.toolName,
                    output: "output" in chunk ? chunk.output : undefined,
                    error: "error" in chunk ? chunk.error : undefined,
                  },
                });
                break;
              }
              case "source":
              case "tool-input-start":
              case "tool-input-delta":
              case "raw":
                break;
              default:
                break;
            }
          },
          onError: (error) => {
            summarySent = true;
            const message = error instanceof Error ? error.message : "AI command failed";
            send("error", { streamId, status: "error", message });
          },
          onFinish: ({ finishReason, usage }) => {
            if (!summarySent) {
              summarySent = true;
              send("summary", {
                streamId,
                status: "success",
                durationMs: Date.now() - startedAt,
                finishReason,
                usage,
              });
            }
          },
        });

        await stream.consumeStream();

        if (!summarySent) {
          summarySent = true;
          send("summary", {
            streamId,
            status: "success",
            durationMs: Date.now() - startedAt,
          });
        }

      } catch (error) {
        const message = error instanceof Error ? error.message : "AI command failed";
        send("error", { streamId, status: "error", message });
      } finally {
        send("close");
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
