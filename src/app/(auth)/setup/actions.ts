"use server";

import { z } from "zod";
import { createInitialAdmin } from "@/server/auth/setup";
import { parseForm } from "@/server/actions/util";
import type { ActionResult } from "@/lib/action-result";

const schema = z
  .object({
    token: z.string().min(1, "Required").max(200),
    name: z.string().trim().min(1, "Required").max(100),
    email: z.string().trim().email("Enter a valid email").max(200),
    password: z.string().min(12, "Use at least 12 characters").max(256),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" });

export async function setupAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const p = parseForm(schema, fd);
  if (!p.ok) return p.result;
  const r = await createInitialAdmin(p.data);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, message: "Account created. Sign in to continue." };
}
