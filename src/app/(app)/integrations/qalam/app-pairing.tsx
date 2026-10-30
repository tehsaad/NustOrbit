"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createQalamToken } from "@/server/actions/integrations";

/**
 * Generates a one-time pairing code for the Orbit Qalam companion app. The code
 * authorizes imports for this account only; it's shown once. Creating a new one
 * replaces the old. Disconnecting Qalam revokes it.
 */
export function AppPairing() {
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  function create() {
    setError(null);
    start(async () => {
      const r = await createQalamToken();
      if (r.ok && r.data) setToken(r.data.token);
      else if (!r.ok) setError(r.error);
    });
  }

  async function copy() {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked; the code stays visible to copy manually */
    }
  }

  return (
    <div className="mt-3">
      <Button size="sm" onClick={create} disabled={pending}>
        <KeyRound /> {token ? "Create a new code" : "Create pairing code"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {token && (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-xs text-muted-foreground">
            Copy this into the app now — it&apos;s shown <span className="font-medium text-foreground">only once</span>. Creating a new code replaces it.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted p-2 font-mono text-[11px]">{token}</code>
            <Button size="sm" variant="outline" onClick={copy} aria-label="Copy pairing code">
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
