"use client";

import { useState, useTransition } from "react";
import { Plus, X } from "lucide-react";
import { saveChecklist } from "@/server/actions/academics";

type Item = { text: string; done: boolean };

export function Checklist({ assignmentId, initial }: { assignmentId: string; initial: Item[] }) {
  const [items, setItems] = useState<Item[]>(initial);
  const [draft, setDraft] = useState("");
  const [, start] = useTransition();

  const persist = (next: Item[]) => {
    setItems(next);
    const fd = new FormData();
    fd.set("id", assignmentId);
    fd.set("checklist", JSON.stringify(next));
    start(async () => {
      await saveChecklist({ ok: true }, fd);
    });
  };

  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={i} className="group flex items-center gap-2 text-sm">
          <input type="checkbox" checked={it.done} onChange={() => persist(items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))} className="size-3.5" aria-label={it.text} />
          <span className={it.done ? "text-muted-foreground line-through" : ""}>{it.text}</span>
          <button type="button" onClick={() => persist(items.filter((_, j) => j !== i))} className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Remove ${it.text}`}>
            <X className="size-3.5" />
          </button>
        </div>
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          persist([...items, { text: draft.trim().slice(0, 300), done: false }]);
          setDraft("");
        }}
        className="flex items-center gap-2"
      >
        <Plus className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add a step" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" aria-label="Add checklist step" />
      </form>
    </div>
  );
}
