"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createNote } from "@/server/actions/productivity";

export function NewNoteButton({ courseId }: { courseId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const { id } = await createNote(courseId);
          router.push(`/notes/${id}`);
        })
      }
    >
      <Plus /> New note
    </Button>
  );
}
