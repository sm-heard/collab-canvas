## Collab Canvas

Lightweight multiplayer canvas experiment built with Next.js App Router, Bun, and Liveblocks (coming soon). This readme documents environment setup, commands, and manual QA flows for the current milestone.

---

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.0
- Node.js 20+ (for tooling compatibility)
- Firebase project configured with Google Auth enabled

---

## Environment Setup

Create a `.env.local` file with the following values (all prefixed with `NEXT_PUBLIC_` so they are available to the client):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY="your-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_APP_ID="1:1234567890:web:abcdef"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="1234567890"
```

These map to the Firebase config object in `lib/firebase.ts`. Without them, the UI will warn and sign-in will not work.

---

## Commands

```bash
bun install        # install dependencies
bun dev            # start Next.js dev server (Turbopack)
bun build          # Next.js production build
bun start          # run compiled build
bun lint           # ESLint with max warnings = 0
```

---

## Manual QA — PR-001 (Firebase Auth & Guard)

1. Ensure `.env.local` is configured with valid Firebase credentials and Google sign-in enabled.
2. Run `bun dev` and open the local URL (defaults to `http://localhost:3000`).
3. **Logged-out state**: the hero section should prompt for sign-in and the toolbar should show “Sign in with Google”.
4. Click the sign-in button and complete the Google popup.
5. **Logged-in state**: toolbar shows your avatar (or initial) and display name; hero copy updates to “You’re signed in and ready to create.”
6. Refresh the page; the session should persist and re-render the signed-in state.
7. Click “Sign out”; verify you return to the logged-out hero and button label.
8. Repeat on a second browser profile to ensure multiple accounts can sign in sequentially without errors.

Capture any issues or unexpected behavior in `tasks.md` under PR-001.

---

## Roadmap Snapshot

- PR-000: repo scaffold, linting, shadcn/ui
- PR-001: Firebase auth (this milestone)
- PR-002+: Liveblocks integration, canvas tooling, realtime presence

See `tasks.md` and `prd.md` for detailed planning and acceptance criteria.
