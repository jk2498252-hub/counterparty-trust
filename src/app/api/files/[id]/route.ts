import { eq } from "drizzle-orm";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/nav";
import { getSessionUser, mfaRequired } from "@/lib/session";
import { readStoredFile } from "@/lib/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || (mfaRequired() && !user.mfaPassed)) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const [doc] = await db.select().from(documents).where(eq(documents.id, id));
  if (!doc) return new Response("Not found", { status: 404 });
  const bytes = await readStoredFile(doc.storedName);
  await audit(user.id, "document.downloaded", { documentId: id }, doc.caseId);
  const asciiName = doc.originalName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(doc.originalName)}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
