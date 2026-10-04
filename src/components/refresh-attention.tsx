"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Refresh read-only attention views without disturbing an active form/copy. */
export function RefreshAttention() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible" && !document.activeElement?.matches("input, textarea, select, [contenteditable=true]")) router.refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}
