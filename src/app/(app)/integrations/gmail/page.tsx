import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink, Mail } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { readInboxSummary } from "@/server/integrations/providers/google";
import { describeError } from "@/server/integrations/errors";
import { isUniversitySender } from "@/domain/email-signals";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ConnectPrompt } from "@/components/connect-prompt";
import { Button } from "@/components/ui/button";
import { SuggestionDialog } from "./suggestion-dialog";

export const metadata: Metadata = { title: "Inbox insights" };

export default async function GmailPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const conn = await db.integrationConnection.findUnique({ where: { userId_provider: { userId: user.id, provider: "gmail" } } });
  const query = (sp.q?.trim() || "newer_than:14d (from:nust.edu.pk OR deadline OR quiz OR exam OR assignment)").slice(0, 200);

  if (!conn || conn.status !== "CONNECTED") {
    return (
      <div>
        <PageHeader title="Inbox insights" />
        <ConnectPrompt title="Gmail isn't connected" body="Connect Gmail on the Integrations page to search mail and spot academic notices." />
      </div>
    );
  }

  let inbox: Awaited<ReturnType<typeof readInboxSummary>> | null = null;
  let error: string | null = null;
  try {
    inbox = await readInboxSummary(conn, query);
  } catch (e) {
    error = describeError(e);
  }
  const content: React.ReactNode = !inbox ? (
    <p className="text-sm text-destructive">Couldn&apos;t read Gmail: {error}</p>
  ) : inbox.messages.length === 0 ? (
    <EmptyState icon={Mail} title="No matching messages" />
  ) : (
    <ul className="space-y-3">
      {inbox.messages.map((m) => (
        <li key={m.id} className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex flex-wrap items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{m.subject || "(no subject)"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {m.from} · {m.date}
                {isUniversitySender(m.from) ? <span className="ml-2 rounded bg-primary/10 px-1.5 text-primary">university</span> : null}
              </p>
            </div>
            <Button asChild size="xs" variant="ghost">
              <a href={`https://mail.google.com/mail/u/0/#all/${m.id}`} target="_blank" rel="noreferrer noopener">
                <ExternalLink /> Open in Gmail
              </a>
            </Button>
          </div>
          {/* Snippet is rendered as plain text; email content is untrusted. */}
          <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{m.snippet}</p>
          {m.signals.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
              {m.signals.map((s, i) => (
                <span key={i} className="rounded-md border border-dashed border-amber-500/60 px-2 py-0.5 text-xs text-amber-700 dark:text-amber-300" title={s.reason}>
                  possible {s.kind.replace("-", " ")} {s.dateText ? `· “${s.dateText}”` : ""} · {s.confidence} confidence
                </span>
              ))}
              <SuggestionDialog messageId={m.id} subject={m.subject} kind={m.signals.some((s) => s.kind === "exam") ? "exam" : "assignment"} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );

  return (
    <div>
      <PageHeader
        title="Inbox insights"
        description="Detected deadlines and exam notices are suggestions based on keywords. Nothing is added to your plan until you choose to, and suggestions stay labelled until you confirm them."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/integrations">Integrations</Link>
          </Button>
        }
      />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={sp.q ?? ""} placeholder="Gmail search, e.g. from:lms newer_than:7d" aria-label="Search Gmail" className="h-9 flex-1 rounded-lg border bg-transparent px-3 text-sm" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>
      {content}
    </div>
  );
}
