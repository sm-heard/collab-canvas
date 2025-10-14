import { NextResponse } from "next/server";
import { Liveblocks } from "@liveblocks/node";
import { adminAuth } from "@/lib/firebase-admin";

const secret = process.env.LIVEBLOCKS_SECRET;

if (!secret) {
  console.warn(
    "Liveblocks: Missing LIVEBLOCKS_SECRET. Token endpoint will reject all requests until configured.",
  );
}

const liveblocks = secret ? new Liveblocks({ secret }) : null;

type AuthBody = {
  room?: string;
  userName?: string;
  avatar?: string | null;
};

export async function POST(request: Request) {
  if (!liveblocks) {
    return NextResponse.json(
      { error: "Liveblocks secret not configured on the server." },
      { status: 500 },
    );
  }

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

  let body: AuthBody = {};

  try {
    body = (await request.json()) as AuthBody;
  } catch {
    // Ignore empty bodies; defaults will be applied below.
  }

  const roomId = body.room ?? "rooms/default";

  try {
    const session = liveblocks.prepareSession(decoded.uid, {
      userInfo: {
        name: body.userName ?? decoded.name,
        avatar: body.avatar ?? decoded.picture,
      },
    });

    session.allow(roomId, session.FULL_ACCESS);

    const token = await session.authorize();

    return NextResponse.json(token);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to authorize Liveblocks session.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

