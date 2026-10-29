import { NextResponse } from "next/server";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Liveness + database reachability. Reveals no configuration or user data. */
export async function GET() {
  let database: "ok" | "error" = "ok";
  try {
    await db.$queryRaw`SELECT 1`;
  } catch {
    database = "error";
  }
  return NextResponse.json({ status: database === "ok" ? "ok" : "degraded", database, time: new Date().toISOString() }, { status: database === "ok" ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
