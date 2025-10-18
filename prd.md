# CollabCanvas — AI Canvas Agent PRD (v1)

**Owner:** Mixas
**Date:** Oct 17, 2025
**Doc status:** Draft for review

---

## 1) Summary

Deliver an AI-driven assistant that creates, manipulates, and arranges canvas objects on behalf of CollabCanvas users via natural-language commands. The assistant uses the Vercel AI SDK for model orchestration, integrates with the existing multiplayer canvas (Liveblocks + `@tldraw/tldraw`), and ensures that AI-generated changes sync in real time for all collaborators. The feature ships as part of the week-1 “AI Canvas Agent” milestone and becomes a differentiating capability after the multiplayer MVP.

---

## 2) Goals & Non-Goals

**Goals**
- Ship a reliable AI assistant that can interpret at least six distinct canvas command categories (create, modify, layout) using natural language.
- Leverage the Vercel AI SDK for streaming, tool-calling, and response handling in Next.js route handlers.
- Ensure AI-driven edits merge with human edits with minimal latency and zero desync.
- Provide clear UX affordances for invoking the AI, previewing intent, and surfacing errors.
- Maintain shared history/state so all users observe identical AI outcomes.

**Non-Goals (Phase 1)**
- Voice input or multimodal prompts (text-only interactions).
- Cross-document agent memory or global knowledge of user projects beyond the active canvas.
- Auto-generated styling themes beyond basic shape colors/typography.

---

## 3) Target Outcomes & Success Metrics

- **AI command latency:** ≤ 2.0 s P95 from submit to first shape mutation event; ≤ 4.0 s for complex multi-step routines (e.g., login form).
- **Command accuracy:** ≥ 85% of evaluated prompts produce expected canvas layout without manual correction (internal QA scripts + manual review).
- **Shared state fidelity:** 0 known desync incidents across 5+ concurrent clients during soak tests.
- **Reliability:** Agent error rate (5xx or tool failures) < 5% of total invocations per day.

---

## 4) Users & Use Cases

- **Product designer:** Iterates on UI mockups by asking the AI to scaffold structures (forms, navigation bars, cards) and fine-tune sizing/alignment.
- **Facilitator or PM:** Rapidly mocks flows during workshops, combining manual edits with AI-driven layout adjustments.
- **New collaborator:** Learns the canvas via natural-language instructions instead of memorizing hotkeys; uses AI to tidy layouts or align elements.

---

## 5) Feature Scope

### 5.1 Required Capabilities (Phase 1)
- **Invocation:** Prompt input field (with `/` shortcut) pinned in the canvas UI; command history viewable per user session.
- **Creation commands:** rectangles, circles, text fields with configurable size, position, color; ability to compose higher-level structures (login form, nav bar, card layout).
- **Manipulation commands:** move, resize, rotate existing shapes identified by color, label, or relative position.
- **Layout commands:** align to grid, distribute evenly, stack horizontally/vertically, build simple grids (≤ 4x4).
- **State query:** AI must call `getCanvasState()` before mutating to ground instructions in latest data.
- **Feedback:** Inline status indicator showing “thinking,” streaming responses from the Vercel AI SDK, and success/error toasts.
- **Undo support:** All AI operations push entries into the existing undo/redo stack where supported by `@tldraw`.

### 5.2 Out-of-Scope (Phase 1)
- AI-driven image generation or import.
- Semantic grouping or naming beyond basic `groupId` tags.
- Per-user AI permissions (everyone in the room can invoke the agent once authenticated).
- Offline AI usage; requires server connectivity.

---

## 6) User Stories & Acceptance Criteria

| Story | Acceptance Criteria |
| --- | --- |
| As a signed-in collaborator, I can invoke the AI to create basic shapes. | Prompting “Create a blue rectangle at 100, 200 sized 200x300” yields a visible shape with requested attributes; all clients see the change within 200 ms. |
| As a collaborator, I can ask the AI to move or resize an existing shape. | Agent resolves target shape via color/name reference; transform completes with live feedback; no duplicate shapes created. |
| As a collaborator, I can request layout adjustments. | Prompts like “Arrange these in a 3x3 grid” reorganize the targeted selection with consistent spacing; selection state preserved. |
| As a collaborator, I can generate multi-element UI patterns. | Commands such as “Create a login form” instantiate grouped inputs, labels, and a button with reasonable spacing and alignment. |
| As a collaborator, I get actionable feedback if the AI fails. | Errors show toast with retry guidance; no partial mutations persist if command aborts. |
| As a collaborator, I can undo AI actions. | Undo removes all changes associated with the AI command in a single step when possible. |

---

## 7) UX Principles & Interaction Flows

- **Fast feedback:** Stream partial reasoning text via Vercel AI SDK’s `streamText` to indicate progress; render delta timeline in the command tray.
- **Clarity:** Display a short success summary (e.g., “Created 3 rectangles and 1 button”) and allow users to expand to view object IDs.
- **Shared awareness:** When AI runs, display an “AI editing…” overlay to other users with the initiating user’s name and command text.
- **Conflict handling:** If another user is actively editing a shape targeted by the AI, notify both users and retry after a short backoff, or skip with a warning.
- **Accessibility:** Prompts are keyboard-first; statuses announced for screen readers.

**Primary Flow (happy path)**
1. User presses `/` or clicks “Ask AI”, enters prompt, submits.
2. Client posts prompt + contextual payload to `/api/ai/command`.
3. Route handler uses Vercel AI SDK to call model with function definitions.
4. AI returns a plan (sequence of function calls); route executes per step against canvas mutation API.
5. On success, response stream updates UI and logs command in history.

**Fallback Flow (error)**
1. Any mutation fails (validation, conflict, network) → route sends structured error event.
2. Client reverts partial mutations and shows retry or manual guidance.

---

## 8) Technical Architecture

### 8.1 High-Level Components
- **Prompt UI:** React component inside the canvas toolbar handling input, command history, and streaming feedback.
- **AI Orchestrator API:** Next.js Route Handler (`src/app/api/ai/command/route.ts`) running on Vercel Edge Runtime using Vercel AI SDK.
- **Canvas Command Adapter:** Server-side module translating AI function calls into Liveblocks storage mutations via existing server helpers or proxying to client through Liveblocks Actions.
- **State Snapshot Service:** Ensures AI-driven changes participate in existing snapshot cadence (10 s idle flush to Firestore).
- **Audit Logger:** Writes AI command metadata to Firestore collection `aiCommands` for diagnostics.

### 8.2 Vercel AI SDK Orchestration Flow
1. Client gathers prompt, current selection IDs, and lightweight canvas summary (object count, names, colors) and posts to the API.
2. Route handler initializes the Vercel AI SDK `AiClient` (model: `gpt-4.1` or equivalent) with function definitions.
3. SDK streams tool calls (`function_call`) representing planned operations.
4. For each call, server invokes mutation helpers (e.g., `createShape`, `moveShape`). Mutations are sent via Liveblocks server API to the room to guarantee immediate sync.
5. Responses stream back to client with progress updates (`progress`, `success`, `error`).
6. On completion, handler records the command summary (prompt, steps, duration) in Firestore.

### 8.3 Function Schema (Draft)
```ts
type ToolDefinitions = {
  getCanvasState: {
    description: "Returns current shapes, selection, and canvas bounds";
    parameters: { minimal?: boolean };
  };
  createShape: {
    parameters: {
      type: "rect" | "circle" | "text" | "group";
      x: number; y: number; width?: number; height?: number;
      text?: string; color?: string; rotation?: number; fontSize?: number;
    };
  };
  moveShape: { parameters: { shapeId: string; x: number; y: number } };
  resizeShape: { parameters: { shapeId: string; width: number; height: number } };
  rotateShape: { parameters: { shapeId: string; degrees: number } };
  arrangeLayout: {
    parameters: {
      shapeIds: string[];
      layout: "grid" | "row" | "column" | "distribute";
      rows?: number; columns?: number; spacing?: number;
    };
  };
  groupShapes: { parameters: { shapeIds: string[]; name?: string } };
};
```

### 8.4 Sync & Conflict Management
- Server mutations write to Liveblocks Storage to guarantee deterministic ordering across clients.
- Use optimistic updates on the initiating client while awaiting confirmation events from Liveblocks.
- If storage conflict occurs (e.g., shape deleted), handler emits `conflict` event; client notifies user and rolls back.
- Introduce lightweight lock (5 s TTL) per shape when AI manipulates objects to prevent simultaneous conflicting edits.

---

## 9) Data & Storage

- **Liveblocks Storage:** Extend `Shape` object with optional `source: "ai" | "user"`, `aiCommandId`, and `metadata` for AI context.
- **Firestore:** Optional `aiCommands` collection for manual QA notes; no automated logging required.

---

## 10) Performance & Reliability

- Route handler executes on Vercel Edge runtime (Node 20) with streaming responses; fallback to Node runtime if tool chain requires.
- Parallelize multi-step commands where safe (e.g., creating grid shapes concurrently) while maintaining deterministic ordering for clients.
- Backoff/retry strategy for transient Liveblocks or Firestore failures (max 2 retries, exponential backoff starting at 250 ms).

---

## 11) Security & Privacy

- Require authenticated user session; server validates Firebase ID token before accepting commands.
- Ensure environment variables for Vercel AI SDK (API keys) are server-only.

---

## 12) Dependencies & Integration

- Vercel AI SDK (`ai` package) v3.x, running on Next.js App Router.
- OpenAI GPT-4.1 or GPT-4o mini for tool calling; support model fallback via config.
- Existing Liveblocks room and mutation helpers; may require server-side service account.
- Firebase Auth for validating the invoking user.
- `@tldraw/tldraw` for executing mutations (ensure APIs accessible server-side via shared utilities).

---

## 13) Phased Rollout & Milestones

| Date | Milestone | Key Deliverables |
| --- | --- | --- |
| Oct 18 | Architecture freeze | Finalize function schemas, data contracts, security approach. |
| Oct 20 | Prototype (closed beta) | Prompt UI stub, Vercel AI SDK route calling mock tool implementations, logs working. |
| Oct 22 | Internal beta | Real mutations wired, 6 command categories validated, undo integration complete. |
| Oct 24 | Public beta | Telemetry, error handling, conflict resolution, documentation. |
| Oct 25 | Final submission | Demo video capture, AI development log completed, updated README/architecture docs. |

---

## 14) QA & Validation Plan

- **Automated smoke:** Jest/Playwright script issuing mock commands to API route with stubbed Liveblocks layer.
- **Manual pairing:** Two operators run through command catalog, confirm sync across browsers, measure latency.
- **Load test:** Simulate 5 concurrent users issuing commands over 10 minutes; ensure no Liveblocks throttling.
- **Regression checks:** Ensure manual drawing/moving still functions while AI operations occur.

---

## 15) Documentation & Delivery Artifacts

- Update `architecture.md` with AI modules diagram.
- Produce AI Development Log (per submission requirement) referencing Vercel AI SDK workflows.
- README section: setup instructions, env vars (`AI_MODEL`, `AI_API_KEY`, `AI_MODERATION_ENABLED`).
- Command reference page describing supported prompts and limitations.

---

## 16) Open Questions

1. Which exact model(s) offer the best latency vs. accuracy trade-off under Vercel AI SDK (gpt-4.1 vs. gpt-4o-mini vs. Anthropic Claude via SDK)?
2. Do we require per-room rate limits to prevent prompt spamming or denial of service from a single user?
3. How should AI-produced objects be semantically labeled for better future selection (e.g., `AI_loginField_username`)?

---

## 17) Acceptance Criteria Summary

| Category | Acceptance Criteria |
| --- | --- |
| Capability coverage | All six command categories (create, move, resize, rotate, layout, complex UI pattern) pass QA scripts. |
| Latency | P95 latency meets targets (≤ 2.0 s single-step, ≤ 4.0 s complex). |
| Reliability | Error rate < 5% across manual QA runs. |
| Sync fidelity | No observed divergence between clients under concurrent AI + manual edits. |
| Documentation | README, architecture updates, AI Dev Log, and command reference published. |
