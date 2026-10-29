import type { Metadata } from "next";
import Link from "next/link";
import { Archive, Download, NotebookPen, Pin, Star } from "lucide-react";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getTimezone } from "@/server/prefs";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { courseLabel, fmtDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Prisma } from "@/generated/prisma/client";
import { NewNoteButton } from "./new-note-button";

export const metadata: Metadata = { title: "Notes" };

export default async function NotesPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; folder?: string; archived?: string; course?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = sp.q?.trim().slice(0, 100);
  const where: Prisma.NoteWhereInput = {
    userId: user.id,
    archived: sp.archived === "1",
    ...(sp.tag ? { tags: { has: sp.tag } } : {}),
    ...(sp.folder ? { folder: sp.folder } : {}),
    ...(sp.course ? { courseId: sp.course } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } }] } : {}),
  };
  const [tz, notes, meta] = await Promise.all([
    getTimezone(user.id),
    db.note.findMany({ where, orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }], take: 200, include: { course: { select: { name: true, code: true } } } }),
    db.note.findMany({ where: { userId: user.id, archived: false }, select: { tags: true, folder: true } }),
  ]);
  const tags = [...new Set(meta.flatMap((m) => m.tags))].sort();
  const folders = [...new Set(meta.map((m) => m.folder).filter((f): f is string => Boolean(f)))].sort();

  return (
    <div>
      <PageHeader
        title="Notes"
        description="Markdown notes linked to courses, assignments and events. Orbit's own notes system (Google Keep has no personal-account API)."
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <a href="/api/export/backup?scope=notes&format=md">
                <Download /> Export
              </a>
            </Button>
            <NewNoteButton />
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
        <aside className="space-y-4 text-sm">
          <form action="/notes" className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Search notes" aria-label="Search notes" className="h-8 w-full rounded-lg border bg-transparent px-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50" />
          </form>
          <nav className="space-y-0.5">
            <Link href="/notes" className={cn("block rounded-md px-2 py-1 hover:bg-muted", !sp.archived && !sp.tag && !sp.folder && "bg-muted font-medium")}>
              All notes
            </Link>
            <Link href="/notes?archived=1" className={cn("flex items-center gap-2 rounded-md px-2 py-1 hover:bg-muted", sp.archived && "bg-muted font-medium")}>
              <Archive className="size-3.5" /> Archived
            </Link>
          </nav>
          {folders.length ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Folders</p>
              {folders.map((f) => (
                <Link key={f} href={`/notes?folder=${encodeURIComponent(f)}`} className={cn("block truncate rounded-md px-2 py-1 hover:bg-muted", sp.folder === f && "bg-muted font-medium")}>
                  {f}
                </Link>
              ))}
            </div>
          ) : null}
          {tags.length ? (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Tags</p>
              <div className="flex flex-wrap gap-1">
                {tags.map((t) => (
                  <Link key={t} href={`/notes?tag=${encodeURIComponent(t)}`} className={cn("rounded-full border px-2 py-0.5 text-xs hover:bg-muted", sp.tag === t && "border-primary text-primary")}>
                    #{t}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
        {notes.length === 0 ? (
          <EmptyState icon={NotebookPen} title={q ? "No matching notes" : "No notes here"} description={q ? undefined : "Capture lecture notes, plans and ideas. Notes autosave as you type."} action={q ? undefined : <NewNoteButton />} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={`/notes/${n.id}`} className="flex h-full flex-col rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40">
                  <div className="flex items-start gap-2">
                    <h2 className="min-w-0 flex-1 truncate font-medium">{n.title || "Untitled"}</h2>
                    {n.pinned ? <Pin className="size-3.5 text-primary" aria-label="Pinned" /> : null}
                    {n.favorite ? <Star className="size-3.5 text-warning" aria-label="Favorite" /> : null}
                  </div>
                  <p className="mt-1 line-clamp-3 flex-1 text-sm text-muted-foreground">{n.content.replace(/[#*_`>\[\]()-]/g, "").slice(0, 240) || "Empty note"}</p>
                  <p className="mt-3 truncate text-[11px] text-muted-foreground">
                    {[n.course ? courseLabel(n.course) : null, n.folder, fmtDateTime(n.updatedAt, tz)].filter(Boolean).join(" · ")}
                  </p>
                  {n.tags.length ? <p className="mt-1 truncate text-[11px] text-primary">{n.tags.map((t) => `#${t}`).join(" ")}</p> : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
