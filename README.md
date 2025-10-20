## Vibeboard

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

- `AI_MODEL` (e.g., `gpt-4.1-mini`)
- `AI_API_KEY`
- `AI_RESPONSE_TIMEOUT_MS` (optional, defaults to 5000 ms)

Add these to `.env.local` alongside the existing Firebase/Liveblocks values:

```bash
AI_MODEL="gpt-4.1-mini"
AI_API_KEY="sk_your_key"
AI_RESPONSE_TIMEOUT_MS="5000"
```

---

## Commands

```bash
bun install        # install dependencies
bun dev            # start Next.js dev server (Turbopack)
bun build          # Next.js production build
bun start          # run compiled build
bun lint           # ESLint with max warnings = 0
```

- `bun test` — Playwright/Jest (if configured)

See `tasks.md` and `prd.md`