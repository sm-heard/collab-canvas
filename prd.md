# Collab Canvas — MVP PRD (v1)

**Owner:** Sami
**Date:** Oct 14, 2025
**Doc status:** Draft for review

---

## 1) Summary

A lightweight, multiplayer design canvas (a “Figma‑like” surface) that supports pan/zoom, creating and moving a basic shape, real‑time collaboration with presence and named cursors, Google sign‑in, and public deployment. One shared global canvas (single room) for the MVP.

---

## 2) Goals & Non‑Goals

**Goals**

* Ship a production‑deployed MVP that demonstrates core real‑time collaboration.
* Minimal, predictable latency for shape creation/move and live cursors.
* Simple auth (Google), single shared canvas, low setup cost.

**Non‑Goals (MVP)**

* Advanced editing (pen tool, bezier paths, boolean ops, images, comments, rich text).
* Project/files system, permissions/roles, granular access controls.
* Version history, branching, exports (beyond simple JSON export), advanced snapshots.
* AI features (phase 2).

---

## 3) MVP Scope

**Included**

* Canvas: pan, zoom, select.
* Shapes: create a rectangle (and optionally text label), move/transform.
* Real‑time: 2+ users editing concurrently with low latency.
* Presence: online users list; multiplayer cursors with name labels & deterministic colors.
* Auth: Google sign‑in (Firebase Auth) required to access canvas.
* Deployment: Vercel (public URL) with environment variables configured.
* Persistence: real‑time state in Liveblocks Storage; periodic durable snapshots to Firestore.

**Excluded for MVP**

* Multi‑room UX, invites/sharing flows.
* Per‑object permissions/locking, comments, undo history beyond what tldraw gives for local session.
* Mobile UI (desktop‑only target).

---

## 4) Success Metrics (MVP)

* **Interaction latency**: cursor updates perceptibly < 100–150 ms; shape move propagation < 150–200 ms P95 on typical broadband.
* **Frame rate**: ≥ 55–60 FPS during pan/zoom with ≤ 500 simple shapes.
* **Reliability**: No data loss for committed creates/moves across tab refresh (covered by snapshots). Session reconnection in < 3 s.
* **Time‑to‑first‑draw**: < 10 s from hitting the URL to placing a rectangle (cold start + auth + UI).

---

## 5) Primary Users & Use Cases

* **Team member/guest:** signs in with Google, lands on the single shared canvas, places/adjusts a rectangle while seeing others’ cursors and selections in real time.
* **Facilitator:** opens two browsers/devices to demonstrate synchronization and presence in a live demo.

---

## 6) User Stories

1. As an authenticated user, I can pan/zoom the canvas fluidly.
2. As an authenticated user, I can add a rectangle to the canvas.
3. As an authenticated user, I can select and move/resize the rectangle.
4. As a collaborator, I see other users’ cursors and names as they move.
5. As a collaborator, I see other users’ edits (shape movement/creation) nearly instantly.
6. As a returning user, refreshing the page restores the latest canvas state from snapshots.
7. As an owner, I can deploy the app and share a public URL; only Google‑signed‑in users may access the canvas.

Acceptance criteria for each story appear in §16.

---

## 7) UX Principles & UI Notes

* **Fast first action**: toolbar exposes a single shape tool (Rect). Keyboard: `V` for select, `R` for rectangle, `Space` for pan (optional if tldraw default is good). Scroll = zoom; right‑drag or Space+drag = pan.
* **Low cognitive load**: minimal chrome; status indicators for connection state and presence count.
* **Discoverable cursors**: show user name and a small colored badge next to cursor; colors are deterministic from `uid`.
* **Empty state**: prompt “Press R to draw a rectangle. Scroll to zoom.”

---

## 8) Technical Stack (ratified)

* **Frontend:** Next.js (App Router) + React, Bun for dev/runtime, Tailwind + shadcn/ui.
* **Canvas:** `@tldraw/tldraw` (selection, transforms, pan/zoom, text).
* **State:** Local ephemeral state via Zustand; authoritative shared state via Liveblocks Storage.
* **Realtime:** Liveblocks (Rooms, Presence, Storage/CRDT). Single room: `rooms/default`.
* **Auth:** Firebase Auth (Google provider).
* **Durable persistence:** Firestore snapshots of shapes (throttled); optional JSON export for manual backup.
* **Deploy:** Vercel. Env vars for Liveblocks secret, Firebase config.
* **Telemetry:** Sentry for errors; Vercel Analytics for basic usage.
* **Validation:** Zod schemas for inbound/outbound shape payloads and snapshot IO.

---

## 9) Architecture Overview

**Client**

* React app hosts a `Tldraw` or custom editor component with a Liveblocks store binding.
* Presence (cursor position, name, color) synced via Liveblocks `useOthers` and `updateMyPresence`.
* UI: minimal toolbar (Select, Rectangle), connection indicator, presence list.

**Server / API routes**

* `/api/liveblocks-auth` — issues room tokens (server‑side secret).
* `/api/snapshot` — optional endpoint to write Firestore snapshots when invoked by client throttle or a scheduled job (can also do client‑side Firestore writes with rules).

**Data flow**

* User signs in → requests Liveblocks room token → joins `rooms/default` → edits update Storage (CRDT) → peers receive deltas.
* Every N seconds or on quiescence, client posts a compressed snapshot to Firestore or writes shape docs directly.

---

## 10) Data Model

**Liveblocks Storage (authoritative live state)**

```ts
Room: "rooms/default"
Storage:
  shapes: Record<shapeId, Shape>
  meta: { version: number; updatedAt: number }
Presence (per‑user):
  { cursor: { x: number; y: number } | null,
    name: string, color: string }

Shape:
  { id: string; type: "rect" | "text"; x: number; y: number;
    width: number; height: number; rotation?: number;
    fill?: string; stroke?: string; text?: string; fontSize?: number;
    createdAt: number; updatedAt: number; lastEditedBy: string }
```

**Firestore (durable snapshots)**

```
/rooms/default/meta:
  lastSnapshotAt, version
/rooms/default/shapes/{shapeId}:
  (same fields as Shape, denormalized)
```

**Identity**

* Display name & photo from Firebase Auth profile. Deterministic color via hash(uid).

---

## 11) Security & Privacy

* Canvas route protected by Firebase Auth guard (client) plus Liveblocks auth token check (server API).
* Liveblocks secret kept only in server environment; tokens are short‑lived and scoped to `rooms/default`.
* Firestore rules: authenticated users can read; writes allowed to `/rooms/default/*` with schema validation.
* No PII beyond Firebase UID, display name, and optional photo URL.

---

## 12) Performance Targets & Tuning

* Cursor presence broadcast at ~30–60 ms; positions interpolated on receive.
* Shape transforms broadcast as minimal deltas; throttle to ~60–90 ms; commit final position on mouseup.
* Snapshot throttle: **10 s idle (hard)**; batched writes.
