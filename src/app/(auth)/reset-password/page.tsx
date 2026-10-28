"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

function ResetForm() {
  const token = useSearchParams().get("token");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const pw = String(fd.get("password"));
    if (pw !== String(fd.get("confirm"))) return setError("Passwords don't match.");
    if (pw.length < 12) return setError("Use at least 12 characters.");
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword: pw, token: token ?? "" });
    setPending(false);
    if (error) return setError("This reset link is invalid or has expired.");
    router.replace("/sign-in");
  }

  if (!token) return <p className="text-sm text-muted-foreground">This reset link is missing its token.</p>;
  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-1.5">
        <Label htmlFor="password">New password</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm">Confirm</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        Set new password
      </Button>
      <p className="text-xs text-muted-foreground">All other sessions will be signed out.</p>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="mb-4 font-medium">Choose a new password</h2>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
