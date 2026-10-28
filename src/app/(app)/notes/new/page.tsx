import { redirect } from "next/navigation";
import { createNote } from "@/server/actions/productivity";

export const dynamic = "force-dynamic";

export default async function NewNotePage() {
  const { id } = await createNote();
  redirect(`/notes/${id}`);
}
