"use client";

import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck } from "lucide-react";
import { connectLmsLogin } from "@/server/actions/integrations";
import { useFormAction, TextField, SubmitButton } from "@/components/forms";

/**
 * The front door: sign in with the NUST LMS username + password. Orbit exchanges
 * them once via Moodle's official login for a token (the password is discarded),
 * then pulls courses, marks, submissions and deadlines. On success the page
 * refreshes to show the synced data.
 */
export function LmsSignIn({ reconnect = false }: { reconnect?: boolean }) {
  const router = useRouter();
  const { state, onSubmit, pending } = useFormAction(connectLmsLogin, () => router.refresh());
  return (
    <section className="rounded-2xl border bg-card p-5 shadow-xs sm:p-6">
      <h1 className="text-xl font-semibold tracking-tight">{reconnect ? "Reconnect your NUST LMS" : "See your whole semester in one place"}</h1>
      <p className="mt-1 max-w-prose text-sm text-muted-foreground">
        Sign in with your NUST LMS username and password — the same ones you use on the LMS website. Orbit signs in once through Moodle&apos;s official login, keeps only an
        encrypted token, and pulls your courses, marks, submissions and deadlines automatically.
      </p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3 sm:max-w-sm">
        <TextField label="LMS username" name="username" required autoComplete="off" autoCapitalize="none" state={state} />
        <TextField label="LMS password" name="password" type="password" required autoComplete="off" state={state} />
        {!state.ok && !state.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <SubmitButton pending={pending} className="w-full sm:w-auto">
          <LogIn /> {pending ? "Signing in & syncing…" : "Sign in & sync"}
        </SubmitButton>
      </form>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-success" aria-hidden="true" /> Your password is used once to get a token and is never stored or logged.
      </p>
    </section>
  );
}
