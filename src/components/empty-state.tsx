import type { LucideIcon } from "lucide-react";

export function EmptyState({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center">
      {Icon ? (
        <div className="mb-3 grid size-10 place-items-center rounded-full bg-muted">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      ) : null}
      <p className="font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
