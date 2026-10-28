"use client";

import { useRouter } from "next/navigation";
import { SubmitButton, TextField, useFormAction } from "@/components/forms";
import { setupAction } from "./actions";

export function SetupForm() {
  const router = useRouter();
  const { state, onSubmit, pending } = useFormAction(setupAction, () => router.replace("/sign-in"));
  return (
    <form onSubmit={onSubmit} className="mt-4 grid gap-3">
      <TextField label="Setup token" name="token" type="password" autoComplete="off" required state={state} />
      <TextField label="Your name" name="name" autoComplete="name" required state={state} />
      <TextField label="Email" name="email" type="email" autoComplete="username" required state={state} />
      <TextField label="Password" name="password" type="password" autoComplete="new-password" required minLength={12} hint="At least 12 characters. A passphrase works well." state={state} />
      <TextField label="Confirm password" name="confirm" type="password" autoComplete="new-password" required state={state} />
      {!state.ok && !state.fieldErrors ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}
