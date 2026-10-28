export type Freshness = { level: "never" | "fresh" | "aging" | "stale"; label: string };

/** Honest freshness label for synced data. Thresholds are in minutes. */
export function freshness(lastSuccessAt: Date | null | undefined, now: Date, freshMin = 60, staleMin = 24 * 60): Freshness {
  if (!lastSuccessAt) return { level: "never", label: "Never synced" };
  const mins = Math.floor((now.getTime() - lastSuccessAt.getTime()) / 60000);
  const label = mins < 1 ? "Synced just now" : mins < 60 ? `Synced ${mins}m ago` : mins < 1440 ? `Synced ${Math.floor(mins / 60)}h ago` : `Synced ${Math.floor(mins / 1440)}d ago`;
  return { level: mins <= freshMin ? "fresh" : mins <= staleMin ? "aging" : "stale", label };
}
