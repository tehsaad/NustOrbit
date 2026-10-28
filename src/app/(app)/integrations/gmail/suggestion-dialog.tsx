"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SelectField, TextField } from "@/components/forms";
import { createSuggestionFromEmail } from "@/server/actions/integrations";

export function SuggestionDialog({ messageId, subject, kind }: { messageId: string; subject: string; kind: "assignment" | "exam" }) {
  return (
    <FormDialog
      trigger={
        <Button size="xs" variant="outline">
          <Plus /> Add as suggestion
        </Button>
      }
      title="Add suggestion from email"
      description="Check the email and enter the actual date. The item stays marked “Suggested” until you confirm it."
      action={createSuggestionFromEmail}
    >
      {(s) => (
        <div className="grid gap-3">
          <input type="hidden" name="messageId" value={messageId} />
          <SelectField
            label="Type"
            name="kind"
            state={s}
            defaultValue={kind}
            options={[
              { value: "assignment", label: "Assignment / deadline" },
              { value: "exam", label: "Exam / quiz" },
            ]}
          />
          <TextField label="Title" name="title" required defaultValue={subject.slice(0, 200)} state={s} />
          <TextField label="Date & time" name="dueAt" type="datetime-local" state={s} />
        </div>
      )}
    </FormDialog>
  );
}
