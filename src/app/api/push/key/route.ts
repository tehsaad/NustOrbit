import { NextResponse } from "next/server";
import { getUserOrNull } from "@/server/auth/session";

/** VAPID public key (public by design) for authenticated clients. */
export async function GET() {
  if (!(await getUserOrNull())) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return NextResponse.json({ error: "not configured" }, { status: 404 });
  return NextResponse.json({ key });
}
