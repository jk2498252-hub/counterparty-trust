import "server-only";
import { db } from "@/db";
import { auditEvents } from "@/db/schema";

export async function audit(actorId: string | null, action: string, detail: Record<string, unknown> = {}, caseId: string | null = null) {
  await db.insert(auditEvents).values({ actorId, action, detail, caseId });
}
