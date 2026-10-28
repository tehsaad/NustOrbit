"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function TwoFactorPage() {
  const router = useRouter();
  const [backup, setBackup] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("code")).replace(/\s+/g, "");
    const trustDevice = fd.get("trust") === "on";
    const res = backup ? await authClient.twoFactor.verifyBackupCode({ code, trustDevice }) : await authClient.twoFactor.verifyTotp({ code, trustDevice });
    setPending(false);
    if (res.error) {
      setError(res.error.status === 429 ? "Too many attempts. Wait and try again." : "That code didn't work.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="font-medium">Two-step verification</h2>
      <p className="mt-1 text-sm text-muted-foreground">{backup ? "Enter one of your backup codes." : "Enter the 6-digit code from your authenticator app."}</p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="code">{backup ? "Backup code" : "Code"}</Label>
          <Input id="code" name="code" inputMode={backup ? "text" : "numeric"} autoComplete="one-time-code" required autoFocus />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="trust" className="size-4" /> Trust this device for 30 days
        </label>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null} Verify
        </Button>
        <button type="button" onClick={() => setBackup((b) => !b)} className="text-xs text-muted-foreground hover:text-foreground">
          {backup ? "Use authenticator code instead" : "Use a backup code"}
        </button>
      </form>
    </div>
  );
}
