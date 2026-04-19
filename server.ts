import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import admin from "firebase-admin";
import axios from "axios";
import crypto from "crypto";
import cors from "cors";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import fs from "fs";
import os from "os";
import { Resend } from "resend";

import firebaseConfigFallback from './firebase-applet-config.json' with { type: 'json' };

interface RequestWithRawBody extends express.Request {
  rawBody?: Buffer;
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

if (!PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY === "sk_test_your_key_here") {
  console.warn("⚠️  PAYSTACK_SECRET_KEY is not set — payments will fail.");
}

// ── Email setup (Resend) ──────────────────────────────────────────────────────
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || "VoucherHub <onboarding@resend.dev>";

if (!admin.apps.length) {
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credential;
  let projectId = process.env.FIREBASE_PROJECT_ID || firebaseConfigFallback.projectId;

  if (serviceAccountEnv) {
    try {
      let serviceAccount;
      const str = serviceAccountEnv.trim();
      if (str.startsWith('{')) {
        serviceAccount = JSON.parse(str);
      } else if (str.startsWith('/') || str.startsWith('./') || str.startsWith('../') || str.startsWith('~')) {
        let filePath = str;
        if (str.startsWith('~')) {
          filePath = path.join(os.homedir(), str.slice(1));
        }
        serviceAccount = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      } else {
        const decoded = Buffer.from(str, 'base64').toString('utf-8');
        serviceAccount = JSON.parse(decoded);
      }
      credential = admin.credential.cert(serviceAccount);
      if (serviceAccount.project_id) projectId = serviceAccount.project_id;
    } catch (e: any) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e.message);
    }
  }

  admin.initializeApp({
    credential: credential || admin.credential.applicationDefault(),
    projectId,
  });
}

const db = admin.firestore();
const app = express();

// ── Security middleware ────────────────────────────────────────────────────────
app.use(cors({
  origin: true, // Allow any origin to accommodate dynamic Vercel preview domains
  credentials: true,
}));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://js.paystack.co", "https://www.google.com", "https://www.gstatic.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://*.firebaseio.com", "https://*.googleapis.com", "https://firestore.googleapis.com", "https://api.paystack.co", "wss://*.firebaseio.com"],
      frameSrc: ["'self'", "https://js.paystack.co", "https://www.google.com"],
    },
  },
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({
  verify: (req: RequestWithRawBody, _res, buf) => { req.rawBody = buf; },
}));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(apiLimiter);

// Stricter rate limit on lookup to prevent brute-force voucher extraction
const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many lookup requests, please try again later.' } });
const paymentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: 'Too many payment attempts, please try again later.' } });

// ── Input validation helpers ──────────────────────────────────────────────────
function isValidString(value: unknown, maxLength = 500): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isValidReference(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_\-]{3,100}$/.test(value);
}

// ── Email helper ──────────────────────────────────────────────────────────────
function buildVoucherEmailHtml(voucherCode: string, reference: string, planName: string, amount: number): string {
  return `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <div style="background:#111827;padding:32px;text-align:center;">
    <h1 style="color:#fff;margin:0;font-size:24px;">🎫 VoucherHub</h1>
    <p style="color:#9CA3AF;margin:8px 0 0;font-size:14px;">Your voucher is ready!</p>
  </div>
  <div style="padding:32px;">
    <div style="background:#F9FAFB;border:2px dashed #E5E7EB;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px;">
      <p style="color:#6B7280;font-size:12px;text-transform:uppercase;letter-spacing:2px;margin:0 0 8px;">Voucher Code</p>
      <p style="font-size:28px;font-weight:bold;font-family:'Courier New',monospace;color:#111827;margin:0;letter-spacing:3px;">${voucherCode}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;font-size:14px;">Transaction Ref</td>
        <td style="padding:12px 0;border-bottom:1px solid #F3F4F6;text-align:right;font-weight:600;color:#111827;font-size:14px;font-family:monospace;">${reference}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;border-bottom:1px solid #F3F4F6;color:#6B7280;font-size:14px;">Plan</td>
        <td style="padding:12px 0;border-bottom:1px solid #F3F4F6;text-align:right;font-weight:600;color:#111827;font-size:14px;">${planName}</td>
      </tr>
      <tr>
        <td style="padding:12px 0;color:#6B7280;font-size:14px;">Amount Paid</td>
        <td style="padding:12px 0;text-align:right;font-weight:600;color:#111827;font-size:14px;">&#8358;${amount.toLocaleString()}</td>
      </tr>
    </table>
    <div style="margin-top:24px;background:#FFFBEB;border-radius:8px;padding:16px;">
      <p style="font-weight:600;color:#92400E;margin:0 0 8px;font-size:14px;">📋 How to use:</p>
      <ol style="color:#78350F;margin:0;padding-left:20px;font-size:13px;line-height:1.8;">
        <li>Connect to the house Wi-Fi network</li>
        <li>Open your browser and wait for the login page</li>
        <li>Enter the voucher code above and click "Connect"</li>
      </ol>
    </div>
  </div>
  <div style="background:#F9FAFB;padding:16px;text-align:center;">
    <p style="color:#9CA3AF;font-size:12px;margin:0;">Keep this email safe. Use your transaction reference to look up your voucher at any time.</p>
  </div>
</div>`;
}

async function sendVoucherEmail(to: string, voucherCode: string, reference: string, planName: string, amount: number): Promise<boolean> {
  if (!resend || !to) {
    console.log("Email skipped — RESEND_API_KEY not configured or no recipient.");
    return false;
  }
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Your Voucher Code — ${reference}`,
      html: buildVoucherEmailHtml(voucherCode, reference, planName, amount),
    });
    console.log(`Email sent to ${to} for ref ${reference}`);
    return true;
  } catch (err: any) {
    console.error("Email send failed:", err.message);
    return false;
  }
}

// ── Write audit log ───────────────────────────────────────────────────────────
async function writeLog(action: string, details: string): Promise<void> {
  try {
    await db.collection("logs").add({
      action,
      details,
      createdAt: admin.firestore.Timestamp.now(),
    });
  } catch (err: any) {
    console.error("Log write failed:", err.message);
  }
}

// ── Auth middleware (kept for admin-only endpoints if needed later) ────────────
async function requireAuth(
  req: express.Request & { uid?: string },
  res: express.Response,
  next: express.NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }
  const idToken = authHeader.slice(7);
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.uid = decoded.uid;
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Paystack webhook (no auth — verified by HMAC signature) ───────────────────
app.post("/api/paystack/webhook", async (req: RequestWithRawBody, res) => {
  try {
    if (!req.rawBody) return res.status(400).send("Missing raw body");
    const hash = crypto
      .createHmac('sha512', PAYSTACK_SECRET_KEY)
      .update(req.rawBody)
      .digest('hex');
    if (hash !== req.headers['x-paystack-signature']) {
      return res.status(401).send("Unauthorized");
    }

    const event = req.body;
    if (event.event === "charge.success") {
      const { reference, customer, metadata, amount } = event.data;
      const planId = metadata?.planId;
      if (!planId) return res.status(200).send("Ignored — no planId in metadata");

      // Validate webhook data
      if (!isValidString(reference, 200) || !isValidString(planId, 100)) {
        return res.status(200).send("Ignored — invalid data");
      }

      let webhookResult: { customerEmail: string; voucherCode: string } | null = null;

      await db.runTransaction(async (transaction) => {
        const txnRef = db.collection("transactions").doc(reference);
        const txnDoc = await transaction.get(txnRef);
        if (txnDoc.exists) return;

        const unusedQ = db
          .collection("vouchers")
          .where("planId", "==", planId)
          .where("status", "==", "unused")
          .limit(1);
        const snap = await transaction.get(unusedQ);
        if (snap.empty) return;

        const voucherDoc = snap.docs[0];
        const voucherCode = voucherDoc.data().code;
        const customerEmail = typeof customer?.email === 'string' ? customer.email.trim().toLowerCase().slice(0, 254) : '';

        transaction.update(voucherDoc.ref, {
          status: "used",
          transactionId: reference,
          customerEmail,
          assignedAt: admin.firestore.Timestamp.now(),
        });
        transaction.set(txnRef, {
          id: reference,
          reference,
          planId,
          houseId: typeof metadata?.houseId === 'string' ? metadata.houseId.slice(0, 100) : "unknown",
          amount: amount / 100,
          customerEmail,
          status: "completed",
          createdAt: admin.firestore.Timestamp.now(),
          source: "webhook",
          voucherId: voucherDoc.id,
          voucherCode: voucherCode,
        });

        webhookResult = { customerEmail, voucherCode };
      });

      // Send email & log after transaction commits
      if (webhookResult && webhookResult.customerEmail) {
        try {
          const planDoc = await db.collection("plans").doc(planId).get();
          const planName = planDoc.exists ? planDoc.data()?.name || "N/A" : "N/A";
          await sendVoucherEmail(webhookResult.customerEmail, webhookResult.voucherCode, reference, planName, amount / 100);
          await writeLog("webhook_voucher_assigned", `Voucher ${webhookResult.voucherCode} assigned to ${webhookResult.customerEmail} (ref: ${reference})`);
        } catch (err) {
          console.error("Post-transaction email/log failed:", err);
        }
      }
    }
    return res.status(200).send("Webhook processed");
  } catch (error: any) {
    console.error("Webhook error:", error.message);
    return res.status(200).send("Webhook error"); // 200 so Paystack won't retry
  }
});

// ── Complete payment ──────────────────────────────────────────────────────────
// Auth is OPTIONAL. Paystack API verification is the real security check.
// This allows both logged-in users and guest users to receive vouchers.
app.post("/api/payment/complete", paymentLimiter, async (req: any, res) => {
  try {
    const { reference, planId, houseId = "unknown" } = req.body;

    if (!isValidReference(reference)) {
      return res.status(400).json({ error: "Invalid reference format" });
    }
    if (!isValidString(planId, 100)) {
      return res.status(400).json({ error: "Invalid planId" });
    }

    // Verify with Paystack — this IS the authentication
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    const { status, data } = paystackRes.data;
    if (!status || data.status !== 'success') {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    const verifiedEmail = typeof data.customer?.email === 'string'
      ? data.customer.email.trim().toLowerCase().slice(0, 254)
      : "";
    const sanitizedHouseId = typeof houseId === 'string' ? houseId.slice(0, 100) : "unknown";

    const result = await db.runTransaction(async (transaction) => {
      const txnRef = db.collection("transactions").doc(reference);
      const txnDoc = await transaction.get(txnRef);
      if (txnDoc.exists) {
        // Already processed — return existing voucher info (idempotent)
        const txnData = txnDoc.data();
        if (txnData?.voucherId) {
          return { voucherId: txnData.voucherId, code: txnData.voucherCode, alreadyProcessed: true };
        }
        
        // Fallback for older transactions
        const vSnap = await db
          .collection("vouchers")
          .where("transactionId", "==", reference)
          .limit(1)
          .get();
        const voucher = vSnap.docs[0];
        return { voucherId: voucher?.id, code: voucher?.data()?.code, alreadyProcessed: true };
      }

      const unusedQ = db
        .collection("vouchers")
        .where("planId", "==", planId)
        .where("status", "==", "unused")
        .limit(1);
      const snap = await transaction.get(unusedQ);
      if (snap.empty) throw new Error("Out of stock");

      const voucherDoc = snap.docs[0];
      const voucherCode = voucherDoc.data().code;

      transaction.update(voucherDoc.ref, {
        status: "used",
        transactionId: reference,
        customerEmail: verifiedEmail,
        assignedAt: admin.firestore.Timestamp.now(),
      });
      transaction.set(txnRef, {
        id: reference,
        reference,
        planId,
        houseId: sanitizedHouseId,
        amount: data.amount / 100,
        customerEmail: verifiedEmail,
        status: "completed",
        createdAt: admin.firestore.Timestamp.now(),
        source: "frontend",
        voucherId: voucherDoc.id,
        voucherCode: voucherCode,
      });

      return { voucherId: voucherDoc.id, code: voucherCode };
    });

    // Send email & write log after successful transaction
    let emailSent = false;
    if (!result.alreadyProcessed && result.code) {
      try {
        const planDoc = await db.collection("plans").doc(planId).get();
        const planName = planDoc.exists ? planDoc.data()?.name || "N/A" : "N/A";
        emailSent = await sendVoucherEmail(verifiedEmail, result.code, reference, planName, data.amount / 100);
        await writeLog("payment_voucher_assigned", `Voucher ${result.code} assigned to ${verifiedEmail} (ref: ${reference})`);
      } catch (err) {
        console.error("Post-transaction email/log failed:", err);
      }
    }

    return res.status(200).json({ success: true, emailSent, ...result });
  } catch (error: any) {
    if (error.message === "Out of stock") {
      return res.status(400).json({ error: "No vouchers available for this plan. Please contact support." });
    }
    console.error("Payment complete error:", error.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Plan stock check (public) ─────────────────────────────────────────────────
app.get("/api/houses/:houseId/stock", async (req, res) => {
  try {
    const { houseId } = req.params;
    if (!isValidString(houseId, 100)) return res.status(400).json({ error: "Invalid house ID" });
    
    const plansSnap = await db.collection("plans").where("houseId", "==", houseId).get();
    if (plansSnap.empty) return res.json({ stock: {} });
    
    const stockStatus: Record<string, boolean> = {};
    for (const pSnap of plansSnap.docs) {
      const unusedQ = await db.collection("vouchers")
        .where("planId", "==", pSnap.id)
        .where("status", "==", "unused")
        .limit(1)
        .get();
        
      stockStatus[pSnap.id] = !unusedQ.empty;
    }
    
    return res.json({ stock: stockStatus });
  } catch (error: any) {
    console.error("Stock check error:", error.message);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Voucher lookup (public — rate-limited) ────────────────────────────────────
app.get("/api/vouchers/lookup", lookupLimiter, async (req: RequestWithRawBody, res) => {
  try {
    const { email, reference } = req.query as { email?: string; reference?: string };
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }
    if (!isValidReference(reference)) {
      return res.status(400).json({ error: "Invalid reference format" });
    }

    const sanitizedEmail = email.trim().toLowerCase();

    const txnSnap = await db
      .collection("transactions")
      .where("reference", "==", reference)
      .where("customerEmail", "==", sanitizedEmail)
      .limit(1)
      .get();

    if (txnSnap.empty) {
      return res.status(404).json({ error: "No matching transaction found." });
    }

    const voucherSnap = await db
      .collection("vouchers")
      .where("transactionId", "==", reference)
      .limit(5)
      .get();

    const vouchers = voucherSnap.docs.map((vDoc) => ({
      id: vDoc.id,
      code: vDoc.data().code,
      planId: vDoc.data().planId,
      houseId: vDoc.data().houseId,
      createdAt: vDoc.data().createdAt?.toDate() || new Date(),
    }));

    return res.json({ vouchers });
  } catch (error: any) {
    console.error("Lookup error:", error.message);
    return res.status(500).json({ error: "Server error" });
  }
});

app.use('/api', (req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "API endpoint not found" });
});

// ── Static / SPA ──────────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const distPath = path.join(__dirname, "dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
} else {
  import("vite").then(({ createServer }) => {
    createServer({ server: { middlewareMode: true }, appType: "spa" }).then((vite) => {
      app.use(vite.middlewares);
    });
  });
}

const PORT = process.env.PORT || 3000;
app.listen(Number(PORT), "0.0.0.0", () =>
  console.log(`Server on port ${PORT} (${isProduction ? "production" : "development"})`)
);

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Express App Error:", err);
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({ error: "Internal Server Error" });
});

export default app;
