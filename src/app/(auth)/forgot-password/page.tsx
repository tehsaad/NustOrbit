"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const email = String(new FormData(e.currentTarget).get("email"));
    await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" }).catch(() => undefined);
    setPending(false);
    setSent(true);
  }

  return (
    <div className="rounded-2xl border bg-card p-6 shadow-sm">
      <h2 className="font-medium">Reset password</h2>
      {sent ? (
        <p className="mt-2 text-sm text-muted-foreground">
          If that address belongs to this Orbit, a reset link is on its way (valid for 30 minutes). If email delivery isn&apos;t configured on this deployment, use the
          recovery steps in docs/security.md.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoFocus />
          </div>
          <Button type="submit" disabled={pending}>
            Send reset link
          </Button>
        </form>
      )}
      <Link href="/sign-in" className="mt-4 inline-block text-xs text-muted-foreground hover:text-foreground">
        ← Back to sign in
      </Link>
    </div>
  );
}
