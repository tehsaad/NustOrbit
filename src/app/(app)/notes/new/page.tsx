import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth/session";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Entry point for the command palette's "New note": creates an empty note and opens it. */
export default async function NewNotePage() {
  const user = await requireUser();
  const note = await db.note.create({ data: { userId: user.id, title: "Untitled", content: "" } });
  redirect(`/notes/${note.id}`);
}
