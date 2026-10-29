import { cn } from "@/lib/utils";

const LABELS: Record<string, { label: string; className: string; title: string }> = {
  MANUAL: { label: "Manual", className: "bg-muted text-muted-foreground", title: "Entered by you in Orbit" },
  ORBIT: { label: "Orbit", className: "bg-primary/12 text-primary", title: "Created in Orbit" },
  LMS: { label: "LMS", className: "bg-sky-500/12 text-sky-600 dark:text-sky-300", title: "From NUST LMS" },
  QALAM: { label: "Qalam", className: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300", title: "From Qalam" },
  IMPORT: { label: "Imported", className: "bg-amber-500/12 text-amber-700 dark:text-amber-300", title: "Imported from a file you provided" },
  GOOGLE_CALENDAR: { label: "Google", className: "bg-blue-500/12 text-blue-700 dark:text-blue-300", title: "From Google Calendar" },
  GMAIL: { label: "Gmail", className: "bg-rose-500/12 text-rose-700 dark:text-rose-300", title: "From Gmail" },
  GOOGLE_TASKS: { label: "Google Tasks", className: "bg-blue-500/12 text-blue-700 dark:text-blue-300", title: "From Google Tasks" },
};

export function SourceBadge({ source, className }: { source: string; className?: string }) {
  const s = LABELS[source] ?? { label: source, className: "bg-muted text-muted-foreground", title: source };
  return (
    <span title={s.title} className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", s.className, className)}>
      {s.label}
    </span>
  );
}

export function SuggestedBadge() {
  return (
    <span title="Detected automatically; confirm before relying on it" className="inline-flex items-center rounded-md border border-dashed border-amber-500/60 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
      Suggested
    </span>
  );
}
