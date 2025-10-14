graph TB
  %% ========= CLIENT =========
  subgraph CLIENT["Browser / Frontend (Next.js + React)"]
    A[app/page.tsx<br/>Canvas route]
    B[components/Canvas.tsx<br/>tldraw editor]
    C[components/Toolbar.tsx<br/>Auth + Export]
    D[components/PresenceAvatars.tsx]
    E[lib/store.ts<br/>Zustand (local UI state)]
    F[lib/colors.ts<br/>uid → color hash]
    G[lib/schema.ts<br/>Zod: Shape/Snapshot]
    H[lib/liveblocks.ts<br/>client provider/hooks]
    I[lib/firebase.ts<br/>Firebase init (client)]
    J1[Vercel Analytics (optional)]
    J2[Sentry SDK (optional)]
  end

  %% ========= SERVER (VERCEL FUNCTIONS) =========
  subgraph SERVER["Next.js Server (Vercel Functions)"]
    S1[/api/liveblocks-auth/route.ts<br/>Mint room-scoped token/]
    S2[/api/snapshot/route.ts<br/>(optional) server snapshot/]
    ENV1[[ENV: LIVEBLOCKS_SECRET]]
  end

  %% ========= EXTERNAL SERVICES =========
  subgraph SERVICES["Managed Services"]
    LB[(Liveblocks<br/>Rooms + Storage (CRDT))]
    LBP[(Liveblocks Presence)]
    FA[(Firebase Auth<br/>Google provider)]
    FS[(Firestore<br/>Durable snapshots)]
  end

  %% ========= TOOLING / RUNTIME =========
  subgraph TOOLING["Tooling / Runtime / Styling"]
    T0[[Bun scripts<br/>dev/build]]
    T2[[ESLint / Prettier]]
    T3[[Tailwind + shadcn/ui]]
    T4[[Vercel Deploy<br/>(app + functions)]]
  end

  %% ========= WIRES: CLIENT APP SHAPE =========
  A --> B
  A --> C
  C --> I
  B <--> E
  E --> G
  A --> H
  A --> J1
  A --> J2
  E --> F

  %% ========= AUTH FLOW =========
  I -->|Google sign-in| FA
  A -->|requires auth to enter canvas| I

  %% ========= LIVEBLOCKS FLOW =========
  A -->|GET /api/liveblocks-auth| S1
  S1 -->|scopes token to room: \"rooms/default\"| LB
  S1 --> ENV1
  H -->|join room w/ token| LB
  H <-->|presence updates| LBP
  B -->|edits → minimal deltas| H
  H -->|CRDT storage updates| LB

  %% ========= SNAPSHOTS (HARD 10s IDLE) =========
  A -.->|after 10s idle (throttle)| FS
  A -.->|or POST snapshot| S2
  S2 -.-> FS

  %% ========= DEPLOY / RUNTIME =========
  T4 --> A
  T4 --> S1
  T4 --> S2
  T3 --> A
  T0 --> A
  T2 --> A

  %% ========= OPTIONALS / NOTES =========
  classDef optional stroke-dasharray: 3 3;
  S2:::optional
  A-.->FS:::optional
  S2-.->FS:::optional

  %% ========= LEGEND =========
  subgraph LEGEND["Legend"]
    L1[Solid arrows: primary data/control flow]
    L2[Dashed arrows: optional paths (snapshot via API or client direct)]
    L3[Single shared room: <code>rooms/default</code>]
    L4[Auth gate: Google only]
  end
