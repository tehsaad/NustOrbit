"use client";

/* eslint-disable react-hooks/set-state-in-effect -- a mount-triggered background sync intentionally sets status from the effect */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { syncNow } from "@/server/actions/integrations";
import { cn } from "@/lib/utils";

/**
 * Scans the LMS for changes when the home screen opens, but only if the last
 * successful sync is older than `staleMinutes` (so opening the app repeatedly
 * doesn't hammer the LMS). Renders a small live status and refreshes the page
 * when new data lands.
 */
export function AutoSync({ lastSuccessAt, staleMinutes = 15 }: { lastSuccessAt: string | null; staleMinutes?: number }) {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const stale = !lastSuccessAt || Date.now() - new Date(lastSuccessAt).getTime() > staleMinutes * 60_000;
    if (!stale) return;
    setStatus("syncing");
    const fd = new FormData();
    fd.set("provider", "lms");
    (async () => {
      try {
        const r = await syncNow({ ok: true }, fd);
        setStatus(r.ok ? "done" : "error");
        if (r.ok) router.refresh();
      } catch {
        setStatus("error");
      }
    })();
  }, [lastSuccessAt, staleMinutes, router]);

  if (status === "idle") return null;
  return (
    <span className={cn("flex items-center gap-1.5 text-xs", status === "error" ? "text-destructive" : "text-muted-foreground")}>
      <RefreshCw className={cn("size-3.5", status === "syncing" && "animate-spin")} aria-hidden="true" />
      {status === "syncing" ? "Checking for updates…" : status === "done" ? "Up to date" : "Couldn’t refresh"}
    </span>
  );
}
