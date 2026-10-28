"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-6 text-center">
      <AlertTriangle className="mx-auto size-8 text-warning" aria-hidden="true" />
      <h2 className="mt-3 font-semibold">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">This section failed to load. Your data is safe.{error.digest ? ` Reference: ${error.digest}` : ""}</p>
      <Button onClick={reset} className="mt-4" variant="outline">
        Try again
      </Button>
    </div>
  );
}
