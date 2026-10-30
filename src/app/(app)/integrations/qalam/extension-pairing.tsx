"use client";

import { useState, useTransition } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createQalamToken } from "@/server/actions/integrations";

export function ExtensionPairing() {
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
      /* clipboard blocked; the token stays visible to copy manually */
    }
  }

  return (
    <div className="mt-3">
      <Button size="sm" onClick={create} disabled={pending}>
        <KeyRound /> {token ? "Create a new token" : "Create pairing token"}
      </Button>
      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {token && (
        <div className="mt-3 rounded-lg border border-warning/40 bg-warning/5 p-3">
          <p className="text-xs text-muted-foreground">
            Copy this now — it is shown <span className="font-medium text-foreground">only once</span>. Paste it into the extension with your Orbit URL. Creating a new token
            replaces this one.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-muted p-2 font-mono text-[11px]">{token}</code>
            <Button size="sm" variant="outline" onClick={copy} aria-label="Copy token">
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
