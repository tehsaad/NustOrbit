import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function SectionCard({
  title,
  icon: Icon,
  href,
  action,
  children,
  className,
  meta,
}: {
  title: string;
  icon?: LucideIcon;
  href?: string;
  action?: React.ReactNode;
  meta?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col rounded-xl border bg-card p-4 shadow-xs", className)}>
      <header className="mb-3 flex items-center gap-2">
        {Icon ? <Icon className="size-4 text-primary" aria-hidden="true" /> : null}
        <h2 className="text-sm font-semibold">{href ? <Link href={href} className="hover:underline">{title}</Link> : title}</h2>
        {meta ? <div className="ml-auto">{meta}</div> : null}
        {action ? <div className={meta ? "" : "ml-auto"}>{action}</div> : null}
      </header>
      <div className="flex-1">{children}</div>
    </section>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
