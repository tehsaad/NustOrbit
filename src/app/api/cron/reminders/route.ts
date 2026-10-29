import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/server/cron-auth";
import { dispatchDueReminders } from "@/server/notify/dispatch";

export const maxDuration = 120;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await dispatchDueReminders());
}

export const POST = GET;
