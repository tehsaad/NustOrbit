"use client";

import { useCallback, useSyncExternalStore } from "react";
import { formatCountdown } from "@/domain/time";

/** Current time, re-rendering every `intervalMs`. Null during SSR to avoid hydration mismatch. */
function useNow(intervalMs = 1000): Date | null {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const id = setInterval(onChange, intervalMs);
      return () => clearInterval(id);
    },
    [intervalMs],
  );
  const tick = useSyncExternalStore(
    subscribe,
    () => Math.floor(Date.now() / intervalMs),
    () => null,
  );
  return tick == null ? null : new Date(tick * intervalMs);
}

export function LiveClock({ tz }: { tz: string }) {
  const now = useNow(1000);
  return (
    <div className="text-right" aria-live="off">
      <div className="font-mono text-3xl font-semibold tabular-nums tracking-tight sm:text-4xl" suppressHydrationWarning>
        {now ? new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).format(now) : "--:--:--"}
      </div>
      <div className="text-xs text-muted-foreground">{tz.replace("_", " ")}</div>
    </div>
  );
}

export function Countdown({ to, prefix = "in " }: { to: string; prefix?: string }) {
  const now = useNow(15_000);
  if (!now) return <span className="tabular-nums">…</span>;
  const ms = new Date(to).getTime() - now.getTime();
  return <span className="tabular-nums">{ms <= 0 ? "now" : `${prefix}${formatCountdown(ms)}`}</span>;
}
