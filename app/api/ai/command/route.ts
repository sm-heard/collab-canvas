import "server-only";

import { NextResponse } from "next/server";
import { createId } from "@paralleldrive/cuid2";

import { adminAuth } from "@/lib/firebase-admin";

const MOCK_TIMELINE = [
  { delay: 200, status: "thinking", message: "Analyzing prompt and canvas state…" },
  { delay: 250, status: "running", message: "Planning high-level steps…" },
  { delay: 250, status: "running", message: "Drafting tool calls…" },
] as const;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ error: "Missing Authorization header." }, { status: 401 });
  }

  const idToken = authHeader.slice("Bearer ".length).trim();
  if (!idToken) {
    return NextResponse.json({ error: "Invalid Authorization header." }, { status: 401 });
  }

  try {
    await adminAuth.verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: "Invalid or expired Firebase token." }, { status: 401 });
  }

  let payload: { prompt?: string } = {};
  try {
    payload = (await request.json()) as { prompt?: string };
  } catch {
    // empty body allowed
  }

  const prompt = payload.prompt?.trim();
  if (!prompt) {
    return NextResponse.json({ error: "Prompt is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const streamId = createId();
  const start = Date.now();

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`event: init\ndata: ${JSON.stringify({ streamId, prompt })}\n\n`),
      );

      for (const event of MOCK_TIMELINE) {
        await new Promise((resolve) => setTimeout(resolve, event.delay));
        controller.enqueue(
          encoder.encode(
            `event: progress\ndata: ${JSON.stringify({ streamId, status: event.status, message: event.message })}\n\n`,
          ),
        );
      }

      const durationMs = Date.now() - start;
      controller.enqueue(
        encoder.encode(
          `event: summary\ndata: ${JSON.stringify({ streamId, status: "success", durationMs })}\n\n`,
        ),
      );

      controller.enqueue(encoder.encode("event: close\n\n"));
      controller.close();
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
