# CollabCanvas — AI Canvas Agent Task & PR Plan (v1)

**Owner:** Mixas  
**Date:** Oct 17, 2025  
**Status:** Draft for review  
**Repo:** `collab-canvas`

> Branching: keep `main` protected; use short-lived feature branches per PR (e.g., `pr-100-ai-orchestrator`).  
> Quality: prioritize end-to-end manual QA walkthroughs aligned with PRD success metrics (latency, accuracy, reliability).

---

## Phase Milestones (AI Canvas Agent)

| Date | Milestone | Key Deliverables |
| --- | --- | --- |
| Oct 18 | Architecture freeze | Finalized function schemas, security approach, PR sequencing. |
| Oct 20 | Prototype (closed beta) | Prompt UI stub + Vercel AI SDK route returning mock tool calls. |
| Oct 22 | Internal beta | Real canvas mutations for six command categories; undo integration. |
| Oct 24 | Public beta | Conflict handling, shared awareness UI, QA checklist complete. |
| Oct 25 | Final submission | Demo assets, AI development log, docs updates, deployment validation. |

---

## Shared Prerequisites

- Confirm existing multiplayer canvas (Liveblocks + `@tldraw`) is stable on latest `main`.
- Gather Vercel AI SDK credentials and model choice (`AI_MODEL`, `AI_API_KEY`).
- Align team on command catalog (create, manipulate, layout, complex UI patterns).
- Baseline manual latency measurements for current canvas operations to compare post-integration.

---

## PR-100 — AI Architecture Preparation & Dependencies

**Goal:** Lay the groundwork for AI integration, ensuring environment, packages, and documentation are ready.

**Subtasks**
- Install Vercel AI SDK (`ai` package) and verify compatibility with Next.js App Router.
- Add `.env.example` entries: `AI_MODEL`, `AI_API_KEY`, `AI_RESPONSE_TIMEOUT_MS`.
- Draft `src/lib/ai/types.ts` with shared TypeScript interfaces for prompts, tool calls, and responses.
- Update `architecture.md` diagram to include AI modules (Prompt UI, API route, command adapter).
- Document local setup steps for Vercel AI SDK in `README.md`.

**Acceptance**
- `bun lint` and `bun build` succeed after dependency changes.
- Updated documentation reviewed and linked from the PR summary.

---

## PR-101 — Prompt UI & Command Tray

**Goal:** Provide users with a discoverable entry point to interact with the AI agent from the canvas.

**Subtasks**
- Create `components/AiCommandTray.tsx` with prompt input, history list, and streaming feedback area.
- Add keyboard shortcut `/` to focus the prompt; ensure Escape blurs.
- Display command status badges (`thinking`, `running`, `error`, `done`).
- Persist command history per session using Zustand or existing UI store.
- Update toolbar to include “Ask AI” button that toggles the tray.

**Acceptance**
- Manual test: submit dummy prompt, see streaming placeholder text, history entry recorded.
- Accessibility pass: prompt supports screen readers (aria labels, status updates).

---

## PR-102 — AI Command API Route (Stubbed)

**Goal:** Implement the Next.js route handler that orchestrates AI responses using Vercel AI SDK, initially returning mock tool calls.

**Subtasks**
- Add `app/api/ai/command/route.ts` using Edge runtime.
- Validate Firebase ID token server-side; reject unauthenticated requests.
- Initialize Vercel AI SDK client with model + timeout configuration.
- Define tool/function schema matching PRD (`getCanvasState`, `createShape`, etc.).
- Return mocked streaming events (`progress`, `success`) without mutating the canvas yet.

**Acceptance**
- `bun lint` and route unit tests (if any) pass.
- Manual `curl` or Playwright script receives streamed mock response.

---

## PR-103 — Canvas Command Adapter & Liveblocks Bridge

**Goal:** Execute AI tool calls against the real canvas state through a server-driven adapter.

**Subtasks**
- Create `src/lib/ai/commands.ts` encapsulating functions: `getCanvasState`, `createShape`, etc.
- Implement Liveblocks server mutations (or proxy to existing mutation helpers) with deterministic ordering.
- Ensure mutations tag `source: "ai"` and include `aiCommandId` metadata when applicable.
- Round-trip test: issue `createShape` call from the stub route to confirm shapes appear for all clients.

**Acceptance**
- Two-browser manual test shows AI-created shape syncing within latency targets.
- Shape metadata (`source`, `aiCommandId`) visible in storage inspector or logs.

---

## PR-104 — Creation & Text Commands

**Goal:** Enable AI-driven creation of basic shapes and grouped UI components.

**Subtasks**
- Map prompts to tool calls for rectangles, circles, and text layers with configurable attributes.
- Implement helpers to center shapes, apply requested colors, and default dimensions when unspecified.
- Build composite routines (e.g., login form, nav bar, card layout) that schedule multiple tool calls sequentially.
- Stream progress updates per step (e.g., “Creating username input”, “Positioning button”).
- Add command result summary to the prompt history.

**Acceptance**
- QA script: prompts for each creation command succeed without manual intervention.
- Manual test verifies complex layout (login form) includes expected elements and spacing.

---

## PR-105 — Manipulation Commands (Move, Resize, Rotate)

**Goal:** Allow the AI to modify existing shapes referenced by color, name, or selection context.

**Subtasks**
- Implement shape lookup resolver handling references like “blue rectangle” or “selected shapes”.
- Add `moveShape`, `resizeShape`, `rotateShape` tool execution with optimistic client updates.
- Manage bounding box adjustments to avoid overlapping shapes when resizing.
- Report partial failures (e.g., shape not found) back to the client with actionable guidance.

**Acceptance**
- Manual test: AI moves, resizes, and rotates shapes across two clients without desync.
- Error messaging verified by issuing prompts referencing non-existent shapes.

---

## PR-106 — Layout & Distribution Commands

**Goal:** Implement higher-order layout operations such as grids, rows, columns, and even spacing.

**Subtasks**
- Add `arrangeLayout` tool logic for `grid`, `row`, `column`, and `distribute` options.
- Support parameters for rows, columns, spacing, and alignment anchors.
- Ensure layout commands work on multi-selection contexts and maintain relative layering.
- Provide undo grouping so the entire layout change reverts in one step.

**Acceptance**
- Manual tests: 3×3 grid creation, horizontal distribution, and column stacking behave as expected.
- Undo restores original positions in a single action.

---

## PR-107 — Shared Awareness & Conflict Handling

**Goal:** Improve collaboration UX by surfacing AI activity and managing edit conflicts.

**Subtasks**
- Display “AI editing…” banner to other users with initiator name and prompt text.
- Implement lightweight locking (5 s TTL) when AI manipulates a shape; release on completion or timeout.
- Detect Liveblocks storage conflicts (deleted/locked shapes) and emit structured `conflict` responses.
- Provide retry/backoff strategy (e.g., two attempts before aborting with message).

**Acceptance**
- Manual test: concurrent user editing triggers conflict message without corrupting state.
- Observed banner disappears promptly after command completion or failure.

---

## PR-108 — Undo Integration & Snapshot Alignment

**Goal:** Ensure AI operations participate in existing undo/redo flows and durable snapshots.

**Subtasks**
- Batch AI mutations into atomic history entries compatible with `@tldraw` undo stack.
- Verify idle snapshot timer persists AI-created shapes to Firestore (no additional work unless bugs found).
- Add optional `Revert last AI action` shortcut in the command history UI.
- Document any known limitations (e.g., complex multi-step undo edge cases).

**Acceptance**
- Manual test: trigger AI command, undo once to revert all related changes, redo to reapply.
- Refresh after idle period retains AI-generated content.

---

## PR-109 — QA Automation & Load Validation

**Goal:** Validate reliability and performance targets outlined in the PRD.

**Subtasks**
- Extend Playwright or integration tests to issue representative prompts and assert canvas state.
- Script latency measurements (command start-to-first mutation) and log results for internal tracking.
- Run 5-user load simulation (multiple browsers or puppeteer) for 10 minutes monitoring desync.
- Compile QA checklist covering all command categories and error flows.

**Acceptance**
- QA report uploaded/linked in PR with latency figures and notable findings.
- No critical issues discovered during load test; regression issues filed if found.

---

## PR-110 — Documentation, Demo, & Launch Readiness

**Goal:** Finalize artifacts required for submission and public beta launch.

**Subtasks**
- Update `README.md` with AI setup instructions, supported commands, and troubleshooting tips.
- Complete AI Development Log (tools, prompts, code attribution, lessons learned).
- Record or script demo video showcasing real-time AI collaboration scenario.
- Ensure deployment environment has required AI env vars and feature flag enabled.
- Perform end-to-end smoke test on production URL with two users.

**Acceptance**
- Launch checklist complete; stakeholders sign off on documentation and demo assets.
- Final smoke test passes without blocking issues.

---

## Environment Variables (AI Feature)

- `AI_MODEL`
- `AI_API_KEY`
- `AI_RESPONSE_TIMEOUT_MS` (optional; sets request timeout)
- Existing Liveblocks and Firebase env vars remain unchanged.

---

## Package Commands (Bun)

- `bun dev` — Next dev
- `bun build` — Next build
- `bun start` — Next start
- `bun lint` — ESLint
- `bun test` — Playwright/Jest (if configured)

---