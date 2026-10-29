import Link from "next/link";
import { PlugZap } from "lucide-react";

/** Shown in place of data when a source isn't connected — never sample data. */
export function ConnectPrompt({ title, body, href = "/integrations", cta = "Connect" }: { title: string; body: string; href?: string; cta?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-dashed p-3">
      <PlugZap className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 text-sm">
        <p className="font-medium">{title}</p>
        <p className="text-muted-foreground">{body}</p>
        <Link href={href} className="mt-1 inline-block text-primary hover:underline">
          {cta} →
        </Link>
      </div>
    </div>
  );
}
