import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { courseOptions } from "@/server/queries/courses";
import { NoteEditor } from "./note-editor";
import { daysFromNow } from "@/lib/clock";

export const metadata: Metadata = { title: "Note" };

export default async function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const note = await db.note.findFirst({ where: { id, userId: user.id } });
  if (!note) notFound();
  const [courses, assignments, events] = await Promise.all([
    courseOptions(user.id),
    db.assignment.findMany({ where: { userId: user.id }, orderBy: { dueAt: "desc" }, take: 100, select: { id: true, title: true } }),
    db.calendarEvent.findMany({ where: { userId: user.id, startsAt: { gte: daysFromNow(-30) } }, orderBy: { startsAt: "asc" }, take: 100, select: { id: true, title: true } }),
  ]);
  return (
    <NoteEditor
      note={{ id: note.id, title: note.title, content: note.content, folder: note.folder ?? "", tags: note.tags.join(", "), courseId: note.courseId ?? "none", assignmentId: note.assignmentId ?? "none", calendarEventId: note.calendarEventId ?? "none", pinned: note.pinned, favorite: note.favorite, archived: note.archived, updatedAt: note.updatedAt.toISOString() }}
      courses={courses}
      assignments={assignments.map((a) => ({ value: a.id, label: a.title }))}
      events={events.map((e) => ({ value: e.id, label: e.title }))}
    />
  );
}
