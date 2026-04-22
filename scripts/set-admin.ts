/**
 * set-admin.ts — Grant admin role to a user in Firestore.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT=./service-account.json \
 *   ADMIN_EMAIL=belloaliyu808@gmail.com \
 *   npx tsx scripts/set-admin.ts
 *
 * Or with inline JSON / base64:
 *   FIREBASE_SERVICE_ACCOUNT='{ ... }' ADMIN_EMAIL=you@example.com npx tsx scripts/set-admin.ts
 */

import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import os from "os";

// ── Parse environment ────────────────────────────────────────────────────────
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (!ADMIN_EMAIL) {
  console.error("❌ ADMIN_EMAIL environment variable is required.");
  process.exit(1);
}
const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;

if (!serviceAccountEnv) {
  console.error("❌ FIREBASE_SERVICE_ACCOUNT is required.");
  console.error("   Set it to a file path, JSON string, or base64-encoded JSON.");
  process.exit(1);
}

// ── Initialize Firebase Admin ────────────────────────────────────────────────
let serviceAccount: admin.ServiceAccount;
const str = serviceAccountEnv.trim();

try {
  if (str.startsWith("{")) {
    serviceAccount = JSON.parse(str);
  } else if (
    str.startsWith("/") ||
    str.startsWith("./") ||
    str.startsWith("../") ||
    str.startsWith("~")
  ) {
    let filePath = str;
    if (str.startsWith("~")) filePath = path.join(os.homedir(), str.slice(1));
    serviceAccount = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } else {
    const decoded = Buffer.from(str, "base64").toString("utf-8");
    serviceAccount = JSON.parse(decoded);
  }
} catch (e: any) {
  console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:", e.message);
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: (serviceAccount as any).project_id,
});

const db = admin.firestore();

// ── Main ─────────────────────────────────────────────────────────────────────
async function setAdmin() {
  console.log(`\n🔐 Setting admin role for: ${ADMIN_EMAIL}\n`);

  // 1. Find the Firebase Auth user (or create one)
  let uid: string;
  try {
    const userRecord = await admin.auth().getUserByEmail(ADMIN_EMAIL);
    uid = userRecord.uid;
    console.log(`✅ Found existing Firebase Auth user: ${uid}`);
  } catch (error: any) {
    if (error.code === "auth/user-not-found") {
      console.log("⚠️  User does not exist in Firebase Auth yet.");
      console.log("   They will be set as admin once they sign up with this email.");
      console.log("   Creating a placeholder user doc...\n");

      // Create the auth user so they can log in
      const newUser = await admin.auth().createUser({
        email: ADMIN_EMAIL,
        emailVerified: true,
      });
      uid = newUser.uid;
      console.log(`✅ Created Firebase Auth user: ${uid}`);
    } else {
      throw error;
    }
  }

  // 2. Set/update the Firestore user document with admin role
  const userDocRef = db.collection("users").doc(uid);
  const existingDoc = await userDocRef.get();

  if (existingDoc.exists) {
    await userDocRef.update({ role: "admin" });
    console.log(`✅ Updated existing user doc → role: 'admin'`);
  } else {
    await userDocRef.set({
      id: uid,
      email: ADMIN_EMAIL,
      role: "admin",
      createdAt: admin.firestore.Timestamp.now(),
    });
    console.log(`✅ Created new user doc with role: 'admin'`);
  }

  // 3. Optionally set custom claims (belt-and-suspenders approach)
  await admin.auth().setCustomUserClaims(uid, { admin: true });
  console.log(`✅ Set custom auth claim: { admin: true }`);

  console.log(`\n🎉 Done! ${ADMIN_EMAIL} now has admin access.`);
  console.log(`   They can log in and access /admin in the app.\n`);

  process.exit(0);
}

setAdmin().catch((err) => {
  console.error("❌ Fatal error:", err);
  process.exit(1);
});
