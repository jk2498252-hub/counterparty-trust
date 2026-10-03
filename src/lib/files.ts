// Upload safety: only known document types, checked by their actual bytes, not just the file name.

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

interface Allowed {
  ext: string[];
  mime: string;
  check: (b: Buffer) => boolean;
}

const startsWith = (b: Buffer, bytes: number[]) => bytes.every((v, i) => b[i] === v);

function looksLikeText(b: Buffer): boolean {
  const sample = b.subarray(0, Math.min(b.length, 4096));
  for (const byte of sample) {
    if (byte === 0) return false; // binary
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(sample.length < b.length ? sample.subarray(0, sample.length - 4) : sample);
    return true;
  } catch {
    return false;
  }
}

const ALLOWED: Allowed[] = [
  { ext: ["pdf"], mime: "application/pdf", check: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46]) },
  { ext: ["png"], mime: "image/png", check: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) },
  { ext: ["jpg", "jpeg"], mime: "image/jpeg", check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  {
    ext: ["docx"],
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    check: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
  {
    ext: ["xlsx"],
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    check: (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]),
  },
  { ext: ["csv"], mime: "text/csv", check: looksLikeText },
  { ext: ["txt"], mime: "text/plain", check: looksLikeText },
  { ext: ["eml"], mime: "message/rfc822", check: looksLikeText },
];

export type FileCheck = { ok: true; mime: string; ext: string } | { ok: false; reason: string };

export function checkUpload(fileName: string, bytes: Buffer): FileCheck {
  if (bytes.length === 0) return { ok: false, reason: "File is empty" };
  if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "File is larger than 15 MB" };
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const rule = ALLOWED.find((a) => a.ext.includes(ext));
  if (!rule) return { ok: false, reason: `File type .${ext} is not accepted. Use PDF, PNG, JPG, DOCX, XLSX, CSV, TXT or EML.` };
  if (!rule.check(bytes)) return { ok: false, reason: `File content does not match a real .${ext} file` };
  return { ok: true, mime: rule.mime, ext };
}

export function safeDisplayName(name: string): string {
  return name.replace(/[^\w.\- ()]+/g, "_").slice(0, 200) || "file";
}

export const DOC_TYPES = [
  "Quote",
  "Invoice",
  "Purchase order / contract",
  "Registration certificate / CR12",
  "KRA PIN certificate",
  "Tax compliance certificate",
  "Licence / permit",
  "Bank letter / payment instruction",
  "Authority letter / resolution",
  "Delivery note / transport record",
  "Correspondence",
  "Source capture",
  "Other",
];
