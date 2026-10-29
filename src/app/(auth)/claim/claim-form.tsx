"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { SubmitButton, TextField, useFormAction } from "@/components/forms";
import type { ActionResult } from "@/lib/action-result";
import { claimAction } from "./actions";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// The one-time token arrives in the URL fragment (never sent to the server).
// It is captured once, then stripped from the address bar and history.
let captured: string | null = null;
function capture() {
  const raw = window.location.hash.slice(1);
  if (!raw) return;
  captured = TOKEN_RE.test(raw) ? raw : "invalid";
  window.history.replaceState(null, "", window.location.pathname);
}
function subscribe(onChange: () => void) {
  const handler = () => {
    capture();
    onChange();
  };
  window.addEventListener("hashchange", handler);
  return () => window.removeEventListener("hashchange", handler);
}

/** undefined while hydrating, null when no valid token was provided. */
function useFragmentToken(): string | null | undefined {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      capture();
      return captured ?? "none";
    },
    () => "pending",
  );
  if (value === "pending") return undefined;
  return value === "none" || value === "invalid" ? null : value;
}

export function ClaimForm() {
  const router = useRouter();
  const token = useFragmentToken();
  const { state, onSubmit, pending } = useFormAction(
    claimAction as (p: ActionResult, fd: FormData) => Promise<ActionResult>,
    (result) => {
      const signedIn = result.ok && (result.data as { signedIn?: boolean } | undefined)?.signedIn;
      router.replace(signedIn ? "/" : "/sign-in");
      router.refresh();
    },
  );

  if (token === undefined) return <p className="text-sm text-muted-foreground">Checking your link…</p>;
  if (token === null) {
    return (
      <div className="text-sm">
        <p className="font-medium">Open your one-time setup link</p>
        <p className="mt-1 text-muted-foreground">
          Account creation needs the single-use link generated with <code className="text-xs">npm run admin:invite</code>. This page can&apos;t be used without it.
        </p>
      </div>
    );
  }
  return (
    <>
      <h2 className="font-medium">Create your account</h2>
      <p className="mt-1 text-sm text-muted-foreground">This link works once and expires soon. Choose a strong password; you can add two-step verification afterwards.</p>
      <form onSubmit={onSubmit} className="mt-4 grid gap-3">
        <input type="hidden" name="token" value={token} />
        <TextField label="Your name" name="name" autoComplete="name" required state={state} />
        <TextField label="Password" name="password" type="password" autoComplete="new-password" required minLength={12} hint="At least 12 characters. A passphrase works well." state={state} />
        <TextField label="Confirm password" name="confirm" type="password" autoComplete="new-password" required state={state} />
        {!state.ok && !state.fieldErrors ? (
          <p className="text-sm text-destructive" role="alert">
            {state.error}
          </p>
        ) : null}
        <SubmitButton pending={pending}>Create account</SubmitButton>
      </form>
    </>
  );
}
