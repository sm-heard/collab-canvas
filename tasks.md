# Collab Canvas — MVP Task & PR Plan (v1)

**Owner:** Sami
**Date:** Oct 14, 2025
**Status:** Draft for review
**Repo:** `collab-canvas` (Next.js App Router, Bun)

> Branching: `main` is protected. Use short‑lived feature branches per PR (e.g., `pr-001-auth`).
> Quality: focus on end-to-end verification via manual QA walkthroughs per milestone.

---

## High‑Level Milestones

* **M0**: Repo scaffold & tooling
* **M1**: Auth (Google) + route guard
* **M2**: Liveblocks (token API, client) + presence
* **M3**: Canvas (tldraw) + rectangle tool + transforms
* **M4**: Realtime sync + throttled deltas
* **M5**: Durable snapshots to Firestore (hard 10‑s idle)
* **M6**: Perf checks + deploy to Vercel

---

## File Structure (target after M6)

```
app/
  layout.tsx
  page.tsx                      // Canvas route
  api/
    liveblocks-auth/route.ts    // Token endpoint
    snapshot/route.ts           // optional; see PR‑006
components/
  Canvas.tsx                    // tldraw wrapper/editor
  Toolbar.tsx
  PresenceAvatars.tsx
  ConnectionIndicator.tsx
lib/
  liveblocks.ts                 // client bindings + hooks
  firebase.ts                   // Firebase init (Auth)
  colors.ts                     // uid→color hashing
  schema.ts                     // zod schemas for Shape, Snapshot
  store.ts                      // zustand local store + adapters
styles/
  globals.css
public/
  favicon.ico
firebase.rules.firestore
.env.example
```

---

## PR‑000 — Repo Scaffold & Tooling

**Goal:** Create Next.js app, add Tailwind + shadcn/ui, lint/format.

**Subtasks**

* Initialize Next.js (App Router, TS). Configure Bun scripts.
* Tailwind setup; import base styles; add `globals.css`.
* Install shadcn/ui and generate minimal Button.
* ESLint + Prettier; strict TS.
* Add `.env.example` and README setup steps.

**Files (create/update)**

* `package.json` (Bun scripts): `dev`, `build`, `start`, `lint`
* `app/layout.tsx`, `app/page.tsx`
* `styles/globals.css`
* `components/Toolbar.tsx` (placeholder)
* `.eslintrc.cjs`, `.prettierrc`
* `.env.example`, `README.md`

**Acceptance**

* `bun dev` runs locally; lint passes.

---

## PR‑001 — Firebase Auth (Google) & Route Guard

**Goal:** Gate canvas behind Google sign‑in; expose user profile to UI.

**Subtasks**

* Add Firebase SDK init (client‑only) and Google provider.
* Sign in/out button in the toolbar; show avatar/name when signed in.
* Simple guard in `app/page.tsx`: redirect to sign‑in pane if unauthenticated.

**Files**

* `lib/firebase.ts` (new)
* `components/Toolbar.tsx` (update: auth buttons, avatar)
* `app/page.tsx` (update: guard)

**Acceptance**

* Visiting `/` prompts Google sign‑in when logged out; after sign‑in, canvas shell is visible.
* Manual QA checklist (see README) executed for both login and logout flows.

---

## PR‑002 — Liveblocks Token API & Client Bindings

**Goal:** Secure Liveblocks with server‑side token issuance; wire client provider and room join (`rooms/default`).

**Subtasks**

* Add `LIVEBLOCKS_SECRET` to env.
* Implement `app/api/liveblocks-auth/route.ts` to mint room‑scoped tokens.
* Create `lib/liveblocks.ts` for provider & hooks setup.

**Files**

* `app/api/liveblocks-auth/route.ts` (new)
* `lib/liveblocks.ts` (new)
* `app/page.tsx` (update: wrap editor with Liveblocks provider)

**Acceptance**

* Network call to `/api/liveblocks-auth` succeeds when signed in; client joins room without errors.
* Manual checklist complete: Liveblocks env vars set, token endpoint returns 200 with Firebase ID token, unauthorized request yields 401.

---

## PR‑003 — Canvas Integration (tldraw) & Large Finite Bounds

**Goal:** Embed tldraw editor with pan/zoom/select; disable undo/redo; set large finite bounds.

**Subtasks**

* Add `@tldraw/tldraw`, render editor in `Canvas.tsx`.
* Configure pan/zoom, selection handles (defaults okay) and keyboard hints (R/V/Space).
* Disable undo/redo for MVP.
* Configure large finite canvas (e.g., 100k × 100k px) and default viewport.
* Add `ConnectionIndicator` skeleton.

**Files**

* `components/Canvas.tsx` (new)
* `components/ConnectionIndicator.tsx` (new)
* `app/page.tsx` (update: mount Canvas)
* `styles/globals.css` (update: editor sizing)

**Acceptance**

* User can pan/zoom/select at ≥55 FPS with empty doc.

---

## PR‑004 — Presence & Multiplayer Cursors with Labels

**Goal:** Show other users’ cursors with name + deterministic color; presence list.

**Subtasks**

* Presence: `updateMyPresence({ cursor })` throttled; `useOthers()` to render peers.
* Deterministic color from `uid` hash; label from Firebase displayName.
* Presence avatars component (optional list).

**Files**

* `lib/colors.ts` (new)
* `components/PresenceAvatars.tsx` (new)
* `components/Canvas.tsx` (update: cursor overlay render)

**Acceptance**

* Opening two windows shows both cursors and labels within ~100–150 ms.

---

## PR‑005 — Rectangle Tool: Create/Move/Resize + Deltas

**Goal:** One shape type (rect). Broadcast minimal deltas during transform; LWW per prop.

**Subtasks**

* Shape schema (Zod) & types; zustand store for local ephemeral edits.
* Bind tldraw shape hooks to Liveblocks Storage map `shapes`.
* During drag: optimistic local update + throttled broadcast (60–90 ms). On mouseup: final commit.
* LWW merge per property (simple): accept incoming if `updatedAt` is newer.

**Files**

* `lib/schema.ts` (new; Shape zod + types)
* `lib/store.ts` (new; reducers + adapters)
* `components/Canvas.tsx` (update: rectangle tool wiring)

**Acceptance**

* User can draw/move/resize a rectangle; peers see updates within ~200 ms P95.

---

## PR‑006 — Firestore Durable Snapshots (10‑s Idle)

**Goal:** Persist shape set to Firestore after 10‑s idle (hard); batch writes.

**Subtasks**

* Add Firestore client; write snapshot routine that posts a single compressed blob to `/api/snapshot`.
* Snapshot trigger: debounce trailing edge 10 s from last mutation; include `version` and timestamp.
* Security rules: authenticated read; `/api/snapshot` writes validated server-side.
* `/api/snapshot` route: accept compressed payload, store in Firestore doc `rooms/default/snapshots/latest` (or similar).
* Add simple **Export JSON** button.

**Files**

* `lib/firebase.ts` (update: add Firestore)
* `app/api/snapshot/route.ts` (new, optional)
* `firebase.rules.firestore` (new)
* `components/Toolbar.tsx` (update: Export JSON)

**Acceptance**

* Refresh after edits restores last snapshot within ~2 s after auth.

---

## PR‑007 — Perf & UX Polish

**Goal:** Keep FPS high; clear status; empty state hints.

**Subtasks**

* Throttle cursor & transform broadcasts (verify cadence).
* Connection indicator for connected/reconnecting; presence count.
* Empty state hint: “Press R to draw a rectangle. Scroll to zoom.”
* Basic telemetry (optional): Vercel Analytics; Sentry for errors.

**Files**

* `components/ConnectionIndicator.tsx` (update)
* `app/layout.tsx` (update: analytics)

**Acceptance**

* Subjective smoothness maintained; no console errors.

---

## PR‑009 — Deployment (Vercel) & Docs

**Goal:** Public URL, env wiring, runbook.

**Subtasks**

* Add Vercel project; set env vars: `LIVEBLOCKS_SECRET`, Firebase keys.
* Protect `main`; require PR checks; preview deployments enabled.
* Update README with setup, env, and dev runbook.

**Files**

* `README.md` (update: deploy steps)
* Vercel project settings (external)

**Verification**

* Manual QA against the preview URL following the checklist.

**Acceptance**

* Public URL live; first‑time user can sign in with Google and draw within 10 s.

---

## Environment Variables

* `LIVEBLOCKS_SECRET`
* `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`, `FIREBASE_APP_ID`, `FIREBASE_MESSAGING_SENDER_ID`
* (optional) `NEXT_PUBLIC_*` Firebase keys for client init

---

## Package Commands (Bun)

* `bun dev` — Next dev
* `bun build` — Next build
* `bun start` — Next start
* `bun lint` — ESLint

---

## Definition of Done (MVP)

* All acceptance criteria in PRD §16 met.
* Deployed on Vercel; Google Auth functional; Liveblocks room join stable.
