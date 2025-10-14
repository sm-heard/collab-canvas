## Collab Canvas

Lightweight multiplayer canvas experiment built with Next.js App Router, Bun, and Liveblocks (coming soon). This readme documents environment setup, commands, and manual QA flows for the current milestone.

---

## Prerequisites

- [Bun](https://bun.sh/) ≥ 1.0
- Node.js 20+ (for tooling compatibility)
- Firebase project configured with Google Auth enabled

---

## Environment Setup

### Client env vars

Create a `.env.local` file with Firebase and Liveblocks public keys (all prefixed with `NEXT_PUBLIC_` so the client can access them):

```bash
NEXT_PUBLIC_FIREBASE_API_KEY="your-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_APP_ID="1:1234567890:web:abcdef"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="1234567890"

NEXT_PUBLIC_LIVEBLOCKS_PUBLIC_KEY="pk_dev_..."
```

`lib/firebase.ts` uses the Firebase values. `lib/liveblocks.ts` uses the Liveblocks public key and falls back to an empty string (with a console warning) if missing.

### Server env vars

Set the following secrets (either in `.env.local` or your deployment provider):

```bash
LIVEBLOCKS_SECRET="sk_liveblocks_room_token_secret"

FIREBASE_PROJECT_ID="your-project-id"
FIREBASE_CLIENT_EMAIL="firebase-adminsdk@example.iam.gserviceaccount.com"
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

These power the Liveblocks token endpoint (`app/api/liveblocks-auth/route.ts`) by validating Firebase ID tokens via the Admin SDK before minting Liveblocks session tokens.

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
