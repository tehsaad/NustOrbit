"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/server/auth/auth";
import { claimInvite } from "@/server/auth/bootstrap";
import { parseForm } from "@/server/actions/util";
import { log } from "@/server/log";
import type { ActionResult } from "@/lib/action-result";

const schema = z
  .object({
    token: z.string().min(1).max(100),
    name: z.string().trim().min(1, "Required").max(100),
    password: z.string().min(12, "Use at least 12 characters").max(256),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" });

export async function claimAction(_: ActionResult, fd: FormData): Promise<ActionResult<{ signedIn: boolean }>> {
  const p = parseForm(schema, fd);
  if (!p.ok) return p.result;
  const r = await claimInvite(p.data);
  if (!r.ok) return { ok: false, error: r.error };
  // Start a brand-new session for the new account (no pre-existing session is reused).
  try {
    await auth.api.signInEmail({ body: { email: r.email, password: p.data.password, rememberMe: true }, headers: await headers() });
    return { ok: true, message: "Welcome to Orbit", data: { signedIn: true } };
  } catch (error) {
    log.warn("bootstrap.auto_sign_in_failed", { error });
    return { ok: true, message: "Account created. Sign in to continue.", data: { signedIn: false } };
  }
}
