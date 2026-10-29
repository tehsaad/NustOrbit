import { freshness } from "@/domain/freshness";
import { cn } from "@/lib/utils";

const DOT: Record<string, string> = { never: "bg-muted-foreground/40", fresh: "bg-success", aging: "bg-warning", stale: "bg-destructive" };

export function FreshnessBadge({ lastSuccessAt, now = new Date(), className }: { lastSuccessAt: Date | null | undefined; now?: Date; className?: string }) {
  const f = freshness(lastSuccessAt, now);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground", className)} title={lastSuccessAt ? lastSuccessAt.toISOString() : undefined}>
      <span className={cn("size-1.5 rounded-full", DOT[f.level])} aria-hidden="true" />
      {f.label}
    </span>
  );
}
