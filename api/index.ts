// api/index.ts — Vercel serverless function (production)
import express from "express";
import path from "path";
import dotenv from "dotenv";
import admin from "firebase-admin";
import axios from "axios";
import crypto from "crypto";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fs from "fs";
import os from "os";
import { Resend } from "resend";

interface RequestWithRawBody extends express.Request {
  rawBody?: Buffer;
}

dotenv.config();

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || "";

// ── Email setup (Resend) ──────────────────────────────────────────────────────
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || "VoucherHub <onboarding@resend.dev>";

// ── Firebase Admin init ───────────────────────────────────────────────────────
if (!admin.apps.length) {
  const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
  let credential;
  let projectId = process.env.FIREBASE_PROJECT_ID;

  if (serviceAccountEnv) {
    try {
      let serviceAccount;
      const str = serviceAccountEnv.trim();
      if (str.startsWith("{")) {
        serviceAccount = JSON.parse(str);
      } else if (str.startsWith("/") || str.startsWith("./") || str.startsWith("../") || str.startsWith("~")) {
        let filePath = str;
        if (str.startsWith("~")) filePath = path.join(os.homedir(), str.slice(1));
        serviceAccount = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      } else {
        const decoded = Buffer.from(str, "base64").toString("utf-8");
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

app.use(express.json({ limit: '16kb', verify: (req: RequestWithRawBody, _res, buf) => { req.rawBody = buf; } }));

const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
app.use(apiLimiter);

const lookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many lookup requests, please try again later." } });
const paymentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: "Too many payment attempts, please try again later." } });

// ── Input validation helpers ──────────────────────────────────────────────────
function isValidString(value: unknown, maxLength = 500): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

function isValidReference(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9_\-]{3,100}$/.test(value);
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

async function sendVoucherEmail(to: string, voucherCode: string, reference: string, planName: string, amount: number): Promise<void> {
  if (!resend || !to) {
    console.log("Email skipped — RESEND_API_KEY not configured or no recipient.");
    return;
  }
  try {
    const response = await resend.emails.send({
      from: FROM_EMAIL,
      to: [to],
      subject: `Your Voucher Code — ${reference}`,
      html: buildVoucherEmailHtml(voucherCode, reference, planName, amount),
    });
    
    if (response.error) {
      console.error("Email API rejected send:", response.error);
    } else {
      console.log(`Email sent to ${to} for ref ${reference} (ID: ${response.data?.id})`);
    }
  } catch (err: any) {
    console.error("Email API threw an exception:", err.message);
    // Don't throw — email failure should never block voucher delivery
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

// ── Paystack webhook (no auth — verified by HMAC signature) ───────────────────
app.post("/api/paystack/webhook", async (req: RequestWithRawBody, res) => {
  try {
    if (!req.rawBody) return res.status(400).send("Missing raw body");
    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(req.rawBody).digest("hex");
    if (hash !== req.headers["x-paystack-signature"]) return res.status(401).send("Unauthorized");

    const event = req.body;
    if (event.event === "charge.success") {
      const { reference, customer, metadata, amount } = event.data;
      const planId = metadata?.planId;
      if (!planId) return res.status(200).send("Ignored — no planId");

      if (!isValidString(reference, 200) || !isValidString(planId, 100)) {
        return res.status(200).send("Ignored — invalid data");
      }

      let webhookResult: { customerEmail: string; voucherCode: string } | null = null;

      await db.runTransaction(async (transaction) => {
        const txnRef = db.collection("transactions").doc(reference);
        const txnDoc = await transaction.get(txnRef);
        if (txnDoc.exists) return; // Already processed (idempotent)

        const snap = await transaction.get(
          db.collection("vouchers").where("planId", "==", planId).where("status", "==", "unused").limit(1)
        );
        if (snap.empty) return;

        const voucherDoc = snap.docs[0];
        const voucherCode = voucherDoc.data().code;
        const customerEmail = typeof customer?.email === "string" ? customer.email.trim().toLowerCase().slice(0, 254) : "";

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
          houseId: typeof metadata?.houseId === "string" ? metadata.houseId.slice(0, 100) : "unknown",
          amount: amount / 100,
          customerEmail,
          status: "completed",
          createdAt: admin.firestore.Timestamp.now(),
          source: "webhook",
          voucherId: voucherDoc.id,
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
    return res.status(200).send("Webhook error");
  }
});

// ── Complete payment ──────────────────────────────────────────────────────────
// Auth is OPTIONAL here. The real security check is Paystack API verification.
// This allows both logged-in users and guests (who paid via Paystack with an email)
// to receive their voucher. The email comes from Paystack's verified response,
// not from the client — so it cannot be spoofed.
app.post("/api/payment/complete", paymentLimiter, async (req: any, res) => {
  try {
    const { reference, planId, houseId = "unknown" } = req.body;

    if (!isValidReference(reference)) {
      return res.status(400).json({ error: "Invalid reference format" });
    }
    if (!isValidString(planId, 100)) {
      return res.status(400).json({ error: "Invalid planId" });
    }

    // Verify payment with Paystack API — this IS the authentication
    const paystackResponse = await axios.get(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    );
    const { status, data } = paystackResponse.data;
    if (!status || data.status !== "success") {
      return res.status(400).json({ error: "Payment verification failed" });
    }

    // Verify planId matches what was embedded in Paystack metadata (prevents plan-swap attacks)
    const verifiedPlanId = data.metadata?.planId;
    if (planId !== verifiedPlanId) {
      await writeLog("payment_plan_mismatch", `PlanId mismatch: body=${planId} vs metadata=${verifiedPlanId} (ref: ${reference})`);
      return res.status(400).json({ error: "Plan mismatch — payment was for a different plan." });
    }

    // Verify the paid amount matches the plan price (prevents client-side amount tampering)
    const planDocForVerify = await db.collection("plans").doc(planId).get();
    if (!planDocForVerify.exists) {
      return res.status(400).json({ error: "Plan not found." });
    }
    const expectedAmountKobo = (planDocForVerify.data()!.price || 0) * 100;
    if (data.amount !== expectedAmountKobo) {
      await writeLog("payment_amount_mismatch", `Amount mismatch: paid=${data.amount} expected=${expectedAmountKobo} (ref: ${reference})`);
      return res.status(400).json({ error: "Amount mismatch — paid amount does not match plan price." });
    }

    const verifiedEmail = typeof data.customer?.email === "string"
      ? data.customer.email.trim().toLowerCase().slice(0, 254)
      : "";
    const sanitizedHouseId = typeof houseId === "string" ? houseId.slice(0, 100) : "unknown";

    const result = await db.runTransaction(async (transaction) => {
      const txnRef = db.collection("transactions").doc(reference);
      const txnDoc = await transaction.get(txnRef);
      if (txnDoc.exists) {
        // Already processed — return existing voucher info (idempotent)
        const vSnap = await db.collection("vouchers").where("transactionId", "==", reference).limit(1).get();
        const v = vSnap.docs[0];
        return { voucherId: v?.id, code: v?.data()?.code, alreadyProcessed: true };
      }

      const snap = await transaction.get(
        db.collection("vouchers").where("planId", "==", planId).where("status", "==", "unused").limit(1)
      );
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
      });

      return { voucherId: voucherDoc.id, code: voucherCode };
    });

    // Send email & write log after successful transaction
    if (!result.alreadyProcessed && result.code) {
      try {
        const planDoc = await db.collection("plans").doc(planId).get();
        const planName = planDoc.exists ? planDoc.data()?.name || "N/A" : "N/A";
        await sendVoucherEmail(verifiedEmail, result.code, reference, planName, data.amount / 100);
        await writeLog("payment_voucher_assigned", `Voucher ${result.code} assigned to ${verifiedEmail} (ref: ${reference})`);
      } catch (err) {
        console.error("Post-transaction email/log failed:", err);
      }
    }

    return res.status(200).json({ success: true, voucherId: result.voucherId });
  } catch (error: any) {
    if (error.message === "Out of stock") return res.status(400).json({ error: "No vouchers available for this plan. Please contact support." });
    console.error("Payment complete error:", error.message);
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

    const txnQuery = await db.collection("transactions")
      .where("reference", "==", reference)
      .where("customerEmail", "==", sanitizedEmail)
      .limit(1)
      .get();
    if (txnQuery.empty) return res.status(404).json({ error: "No matching transaction found." });

    const voucherSnapshot = await db.collection("vouchers")
      .where("transactionId", "==", reference)
      .limit(5)
      .get();

    const vouchers = voucherSnapshot.docs.map(vDoc => ({
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

app.use((req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "API endpoint not found" });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("Express App Error:", err);
  if (res.headersSent) return next(err);
  return res.status(err.status || 500).json({ error: "Internal Server Error" });
});

export default app;
