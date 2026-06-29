import dotenv from "dotenv";
dotenv.config();
import { Router } from "express";
import { generateToken } from "../lib/auth";
import { db } from "@workspace/db";
import { adminsTable, otpsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

import http from "http";
import { logActivity } from "../lib/activityLogger";

const router = Router();

// ── Helper: send SMS via powerstext.in ───────────────────────────────
async function sendSms(phone: string, message: string): Promise<void> {
  const authenticKey = process.env.SMS_AUTH_KEY ?? "";
  const senderid = "DSAENT";
  const templateid = "1607100000000367692";

  const params = new URLSearchParams({
    "authentic-key": authenticKey,
    senderid,
    route: "1",
    number: phone,
    message,
    templateid,
  });

  const url = `http://sms1.powerstext.in/http-tokenkeyapi.php?${params.toString()}`;

  console.log("SMS URL:", url); // debug

  await new Promise<void>((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          console.log("SMS API status:", res.statusCode); // debug
          console.log("SMS API response:", body);         // debug

          // Accept if status 200 — regardless of body content
          // since different SMS APIs return different success strings
          if (res.statusCode === 200) {
            resolve();
          } else {
            reject(new Error(`SMS API failed (${res.statusCode}): ${body}`));
          }
        });
      })
      .on("error", (err) => {
        console.error("SMS HTTP error:", err.message);
        reject(err);
      });
  });
}

// ── POST /api/auth/send-otp ───────────────────────────────────────────
// Body: { phone: string }
router.post("/auth/send-otp", async (req, res): Promise<void> => {
  const phone = (req.body?.phone ?? "").toString().trim();

  if (!/^\d{10}$/.test(phone)) {
    res.status(400).json({ error: "Enter a valid 10-digit phone number" });
    return;
  }

  const [admin] = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.phone, phone));

  if (!admin || !admin.isActive) {
    res.status(404).json({ error: "Phone number not registered" });
    return;
  }

  const otp = Math.floor(1000 + Math.random() * 9000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.delete(otpsTable).where(eq(otpsTable.phone, phone));
  await db.insert(otpsTable).values({ phone, otp, expiresAt });

  const message = `Use this verification code ${otp} to verify your mobile number on WealthFunds2x DE`;

  try {
    await sendSms(phone, message);
    res.json({ success: true, message: "OTP sent successfully" });
  } catch (err: any) {
    console.error("SMS error:", err.message);
    res.status(500).json({
      error: "SMS service unavailable. Please use password login.",
    });
  }
});

// ── POST /api/auth/verify-otp ─────────────────────────────────────────
// Body: { phone: string, otp: string }
router.post("/auth/verify-otp", async (req, res): Promise<void> => {
  const phone = (req.body?.phone ?? "").toString().trim();
  const otp = (req.body?.otp ?? "").toString().trim();

  if (!phone || !otp) {
    res.status(400).json({ error: "Phone and OTP are required" });
    return;
  }

  const [record] = await db
    .select()
    .from(otpsTable)
    .where(eq(otpsTable.phone, phone));

  if (!record) {
    res.status(401).json({ error: "No OTP found. Please request a new one." });
    return;
  }

  if (new Date() > record.expiresAt) {
    await db.delete(otpsTable).where(eq(otpsTable.phone, phone));
    res.status(401).json({ error: "OTP expired. Please request a new one." });
    return;
  }

  if (record.otp !== otp) {
    res.status(401).json({ error: "Invalid OTP. Please try again." });
    return;
  }

  await db.delete(otpsTable).where(eq(otpsTable.phone, phone));

  const [admin] = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.phone, phone));

  const token = generateToken(admin.id);
await logActivity("Admin logged in via OTP", { id: admin.id, name: admin.name, phone: admin.phone });
res.json({
  token,
  admin: { id: admin.id, name: admin.name, phone: admin.phone },
});
});

// ── POST /api/auth/login (phone + password) ───────────────────────────
// Body: { phone: string, password: string }
router.post("/auth/login", async (req, res): Promise<void> => {
  const phone = (req.body?.phone ?? "").toString().trim();
  const password = (req.body?.password ?? "").toString();

  if (!phone || !password) {
    res.status(400).json({ error: "Phone and password are required" });
    return;
  }

  if (!/^\d{10}$/.test(phone)) {
    res.status(400).json({ error: "Enter a valid 10-digit phone number" });
    return;
  }

  const [admin] = await db
    .select()
    .from(adminsTable)
    .where(eq(adminsTable.phone, phone));

  if (!admin || !admin.isActive) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = password === admin.password;
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = generateToken(admin.id);
await logActivity("Admin logged in via password", { id: admin.id, name: admin.name, phone: admin.phone });
res.json({
  token,
  admin: { id: admin.id, name: admin.name, phone: admin.phone },
});
});

export default router;









// import { Router } from "express";
// import { generateToken, validatePassword } from "../lib/auth";
// import { LoginBody, LoginResponse } from "@workspace/api-zod";

// const router = Router();

// router.post("/auth/login", async (req, res): Promise<void> => {
//   const parsed = LoginBody.safeParse(req.body);
//   if (!parsed.success) {
//     res.status(400).json({ error: "Missing password" });
//     return;
//   }
//   if (!validatePassword(parsed.data.password)) {
//     res.status(401).json({ error: "Invalid password" });
//     return;
//   }
//   const token = generateToken();
//   res.json(LoginResponse.parse({ token }));
// });

// export default router;
