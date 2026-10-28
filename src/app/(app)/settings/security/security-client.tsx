"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export function PasswordForm() {
  const [pending, setPending] = useState(false);
  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const newPassword = String(fd.get("new"));
    if (newPassword.length < 12) return toast.error("Use at least 12 characters.");
    if (newPassword !== String(fd.get("confirm"))) return toast.error("Passwords don't match.");
    setPending(true);
    // Changing the password rotates the session and signs out every other session.
    const { error } = await authClient.changePassword({ currentPassword: String(fd.get("current")), newPassword, revokeOtherSessions: true });
    setPending(false);
    if (error) return toast.error(error.status === 429 ? "Too many attempts. Try later." : "Current password is incorrect.");
    form.reset();
    toast.success("Password changed. Other sessions were signed out.");
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="pw-current">Current password</Label>
        <Input id="pw-current" name="current" type="password" autoComplete="current-password" required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-new">New password</Label>
        <Input id="pw-new" name="new" type="password" autoComplete="new-password" minLength={12} required />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pw-confirm">Confirm new password</Label>
        <Input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>
      <Button type="submit" disabled={pending} className="justify-self-start">
        Change password
      </Button>
    </form>
  );
}

export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [setup, setSetup] = useState<{ uri: string; secret: string; backupCodes: string[] } | null>(null);
  const [pending, setPending] = useState(false);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const password = String(new FormData(e.currentTarget).get("password"));
    const { data, error } = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (error || !data) return toast.error("Password incorrect.");
    if (data.method !== "totp") return toast.error("Unexpected two-factor method.");
    const secret = new URL(data.totpURI).searchParams.get("secret") ?? "";
    setSetup({ uri: data.totpURI, secret, backupCodes: data.backupCodes });
  }

  async function verify(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const code = String(new FormData(e.currentTarget).get("code")).replace(/\s/g, "");
    const { error } = await authClient.twoFactor.verifyTotp({ code });
    setPending(false);
    if (error) return toast.error("That code didn't match. Check your device clock.");
    toast.success("Two-step verification is on.");
    setSetup(null);
    router.refresh();
  }

  async function disable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    const { error } = await authClient.twoFactor.disable({ password: String(new FormData(e.currentTarget).get("password")) });
    setPending(false);
    if (error) return toast.error("Password incorrect.");
    toast.success("Two-step verification turned off.");
    router.refresh();
  }

  if (setup) {
    return (
      <div className="space-y-3 text-sm">
        <p>Add this key to your authenticator app (Google Authenticator, Aegis, 1Password…), then enter the 6-digit code.</p>
        <code className="block break-all rounded-md bg-muted p-2 font-mono text-xs">{setup.secret}</code>
        <a href={setup.uri} className="text-xs text-primary hover:underline">
          Open in authenticator app (on this device)
        </a>
        <div>
          <p className="font-medium">Backup codes — store them somewhere safe:</p>
          <code className="mt-1 grid grid-cols-2 gap-1 rounded-md bg-muted p-2 font-mono text-xs">
            {setup.backupCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </code>
        </div>
        <form onSubmit={verify} className="flex gap-2">
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" placeholder="123456" required aria-label="Verification code" />
          <Button type="submit" disabled={pending}>
            Verify
          </Button>
        </form>
      </div>
    );
  }

  return (
    <form onSubmit={enabled ? disable : start} className="grid gap-3 text-sm">
      <p className="text-muted-foreground">
        {enabled ? "Enabled. Sign-ins require a code from your authenticator app." : "Add a second step at sign-in using an authenticator app."}
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="tf-password">Confirm with your password</Label>
        <Input id="tf-password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" disabled={pending} variant={enabled ? "destructive" : "default"} className="justify-self-start">
        {enabled ? "Turn off" : "Set up"}
      </Button>
    </form>
  );
}
