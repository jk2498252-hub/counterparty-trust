import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { authenticator } from "otplib";
import QRCode from "qrcode";

authenticator.options = { window: 1 };

function sign(userId: string, secret: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`mfa-setup:${userId}:${secret}`).digest("hex");
}

/** Creates a new secret for display. Nothing is saved until the user proves they scanned it. */
export async function newMfaSetup(userId: string, email: string) {
  const secret = authenticator.generateSecret();
  const qr = await QRCode.toDataURL(authenticator.keyuri(email, "Counterparty Trust", secret));
  return { secret, qr, sig: sign(userId, secret) };
}

export function verifySetupSignature(userId: string, secret: string, sig: string): boolean {
  const expected = Buffer.from(sign(userId, secret), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function verifyCode(secret: string, code: string): boolean {
  return authenticator.verify({ token: code.replace(/\s/g, ""), secret });
}
