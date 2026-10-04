import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1 };

function sign(userId: string, sessionVersion: number, secret: string, expires: number): string {
  const key = process.env.SESSION_SECRET;
  if (!key || key.length < 32) throw new Error("SESSION_SECRET must be set (32+ characters)");
  return createHmac("sha256", key).update(`mfa-setup:${userId}:${sessionVersion}:${secret}:${expires}`).digest("hex");
}

/** Creates a new secret for display. Nothing is saved until the user proves they scanned it. */
export async function newMfaSetup(userId: string, email: string, sessionVersion: number) {
  const secret = authenticator.generateSecret();
  const qr = await QRCode.toDataURL(authenticator.keyuri(email, "Counterparty Trust", secret));
  const expires = Date.now() + 5 * 60_000;
  return { secret, qr, expires, sig: sign(userId, sessionVersion, secret, expires) };
}

export function verifySetupSignature(userId: string, sessionVersion: number, secret: string, expires: number, sig: string): boolean {
  if (!Number.isSafeInteger(expires) || expires <= Date.now() || expires > Date.now() + 5 * 60_000 || !/^[A-Z2-7]{16,64}$/.test(secret) || !/^[a-f0-9]{64}$/.test(sig)) return false;
  const expected = Buffer.from(sign(userId, sessionVersion, secret, expires), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function verifyCode(secret: string, code: string): boolean {
  const token = code.replace(/\s/g, "");
  return /^\d{6}$/.test(token) && authenticator.verify({ token, secret });
}
