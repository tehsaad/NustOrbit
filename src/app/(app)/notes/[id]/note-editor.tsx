"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Archive, ArchiveRestore, Check, Loader2, Pin, Star, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmAction, InlineAction } from "@/components/forms";
import { autosaveNote, deleteNote, setNoteFlag } from "@/server/actions/productivity";
import { cn } from "@/lib/utils";

type NoteState = { id: string; title: string; content: string; folder: string; tags: string; courseId: string; assignmentId: string; calendarEventId: string; pinned: boolean; favorite: boolean; archived: boolean; updatedAt: string };
type Opt = { value: string; label: string };
type SaveStatus = "saved" | "dirty" | "saving" | "error";

export function NoteEditor({ note, courses, assignments, events }: { note: NoteState; courses: Opt[]; assignments: Opt[]; events: Opt[] }) {
  const [draft, setDraft] = useState(note);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState(note.updatedAt);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef(draft);
  useEffect(() => {
    latest.current = draft;
  }, [draft]);

  const save = useCallback(async () => {
    setStatus("saving");
    const d = latest.current;
    const r = await autosaveNote({ id: d.id, title: d.title, content: d.content, folder: d.folder, tags: d.tags, courseId: d.courseId, assignmentId: d.assignmentId, calendarEventId: d.calendarEventId });
    if (r.ok) {
      setSavedAt(r.data?.savedAt ?? new Date().toISOString());
      setStatus(latest.current === d ? "saved" : "dirty");
    } else setStatus("error");
  }, []);

  const update = (patch: Partial<NoteState>) => {
    latest.current = { ...latest.current, ...patch };
    setDraft((d) => ({ ...d, ...patch }));
    setStatus("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, 800);
  };

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (status === "dirty" || status === "saving") e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  const select = "h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/notes" className="text-xs text-muted-foreground hover:underline">
          ← Notes
        </Link>
        <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground" role="status" aria-live="polite">
          {status === "saving" ? (
            <>
              <Loader2 className="size-3 animate-spin" /> Saving…
            </>
          ) : status === "dirty" ? (
            "Unsaved changes"
          ) : status === "error" ? (
            <span className="flex items-center gap-1 text-destructive">
              <TriangleAlert className="size-3" /> Save failed
              <button type="button" onClick={save} className="underline">
                retry
              </button>
            </span>
          ) : (
            <>
              <Check className="size-3 text-success" /> Saved {new Date(savedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </>
          )}
        </span>
        <InlineAction action={setNoteFlag} hidden={{ id: note.id, flag: "pinned", value: String(!note.pinned) }}>
          <Button type="submit" size="icon-sm" variant={note.pinned ? "secondary" : "ghost"} aria-label={note.pinned ? "Unpin" : "Pin"} aria-pressed={note.pinned}>
            <Pin />
          </Button>
        </InlineAction>
        <InlineAction action={setNoteFlag} hidden={{ id: note.id, flag: "favorite", value: String(!note.favorite) }}>
          <Button type="submit" size="icon-sm" variant={note.favorite ? "secondary" : "ghost"} aria-label={note.favorite ? "Unfavorite" : "Favorite"} aria-pressed={note.favorite}>
            <Star />
          </Button>
        </InlineAction>
        <InlineAction action={setNoteFlag} hidden={{ id: note.id, flag: "archived", value: String(!note.archived) }}>
          <Button type="submit" size="icon-sm" variant="ghost" aria-label={note.archived ? "Unarchive" : "Archive"}>
            {note.archived ? <ArchiveRestore /> : <Archive />}
          </Button>
        </InlineAction>
        <ConfirmAction
          action={async (p, fd) => {
            const r = await deleteNote(p, fd);
            if (r.ok) window.location.href = "/notes";
            return r;
          }}
          hidden={{ id: note.id }}
          title="Delete note?"
          description="This permanently deletes the note. Export first if you want a copy."
          trigger={
            <Button size="icon-sm" variant="ghost" aria-label="Delete note">
              <Trash2 />
            </Button>
          }
        />
      </div>

      <input value={draft.title} onChange={(e) => update({ title: e.target.value })} placeholder="Untitled" aria-label="Title" className="w-full bg-transparent text-2xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground" maxLength={200} />

      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <select className={select} value={draft.courseId} onChange={(e) => update({ courseId: e.target.value })} aria-label="Course">
          <option value="none">No course</option>
          {courses.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select className={select} value={draft.assignmentId} onChange={(e) => update({ assignmentId: e.target.value })} aria-label="Linked assignment">
          <option value="none">No assignment</option>
          {assignments.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select className={select} value={draft.calendarEventId} onChange={(e) => update({ calendarEventId: e.target.value })} aria-label="Linked event">
          <option value="none">No event</option>
          {events.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <input className={select} value={draft.folder} onChange={(e) => update({ folder: e.target.value })} placeholder="Folder" aria-label="Folder" maxLength={80} />
        <input className={select} value={draft.tags} onChange={(e) => update({ tags: e.target.value })} placeholder="tags, comma, separated" aria-label="Tags" maxLength={400} />
      </div>

      <div className="mt-4 flex gap-1 border-b" role="tablist">
        {(["write", "preview"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)} className={cn("-mb-px border-b-2 px-3 py-1.5 text-sm capitalize", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "write" ? (
        <textarea
          value={draft.content}
          onChange={(e) => update({ content: e.target.value })}
          placeholder="Write in Markdown…"
          aria-label="Note content"
          className="mt-3 min-h-[60dvh] w-full resize-y rounded-lg bg-transparent font-mono text-sm leading-relaxed outline-none"
        />
      ) : (
        <article className="prose-orbit mt-4 min-h-[60dvh]">
          {draft.content ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{draft.content}</ReactMarkdown> : <p className="text-muted-foreground">Nothing to preview.</p>}
        </article>
      )}
    </div>
  );
}
