import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.warn(
    "Firebase Admin: Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY. Token verification will fail until these are set.",
  );
}

const adminApp =
  getApps().find((app) => app.name === "admin") ??
  initializeApp(
    projectId && clientEmail && privateKey
      ? {
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        }
      : undefined,
    "admin",
  );

export const adminAuth = getAuth(adminApp);

