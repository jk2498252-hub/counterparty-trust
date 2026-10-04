import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { eq } from "drizzle-orm";
import { getDb, transactionContext } from "@/db";
import { appLocks } from "@/db/schema";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getURLFromRedirectError } from "next/dist/client/components/redirect";

type Cleanup = () => Promise<void>;
const rollbackContext = new AsyncLocalStorage<Cleanup[]>();
const commitContext = new AsyncLocalStorage<(() => void)[]>();

/** Cookie changes are published only after the business transaction commits. */
export function afterCommit(effect: () => void) {
  const effects = commitContext.getStore();
  if (effects) effects.push(effect);
  else effect();
}

/** Register a staged file for deletion if its database transaction fails. */
export function onRollback(cleanup: Cleanup) {
  const callbacks = rollbackContext.getStore();
  if (!callbacks) throw new Error("A file must be saved inside a workflow transaction");
  callbacks.push(cleanup);
}

/**
 * Every server-action mutation uses this transaction, including its permission
 * checks, version changes and audit writes. The row lock also works across
 * server processes. Global locking is intentional for the single-org pilot.
 *
 * Next's successful redirects are thrown exceptions: commit first, then rethrow
 * them. Validation redirects roll back. Authentication failures opt in to
 * committing error redirects, so attempt counters and audit records survive.
 */
export async function runWorkflow<T>(work: () => Promise<T>, opts: { commitErrorRedirects?: boolean } = {}): Promise<T> {
  if ((globalThis as unknown as { __kctClosing?: boolean }).__kctClosing) throw new Error("The workbench is closing. Retry after it restarts.");
  if (transactionContext.getStore()) return work();
  const cleanup: Cleanup[] = [];
  const effects: (() => void)[] = [];
  let redirect: unknown;
  let value: T;
  try {
    value = await getDb().transaction(async (tx) => {
      const [lock] = await tx.select().from(appLocks).where(eq(appLocks.id, "workflow")).for("update");
      if (!lock) throw new Error("Workflow lock is missing; run database migrations before starting the app");
      return transactionContext.run(tx, () => rollbackContext.run(cleanup, () => commitContext.run(effects, async () => {
        try {
          return await work();
        } catch (error) {
          if (isRedirectError(error)) {
            const destination = new URL(getURLFromRedirectError(error) ?? "/", "http://workbench.local");
            if (!destination.searchParams.has("err") || opts.commitErrorRedirects) {
              redirect = error;
              return undefined as T;
            }
          }
          throw error;
        }
      })));
    });
  } catch (error) {
    const results = await Promise.allSettled(cleanup.map((remove) => remove()));
    if (results.some((r) => r.status === "rejected")) console.error("Failed to remove a rolled-back upload");
    throw error;
  }
  for (const effect of effects) effect();
  if (redirect) throw redirect;
  return value;
}
