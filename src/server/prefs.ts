import "server-only";
import { cache } from "react";
import { db } from "./db";
import { DEFAULT_TZ } from "@/domain/time";
import type { AttendancePolicy } from "@/domain/attendance";

export const getPrefs = cache(async (userId: string) => {
  const p = await db.userPreference.upsert({ where: { userId }, create: { userId, timezone: process.env.ORBIT_TIMEZONE ?? DEFAULT_TZ }, update: {} });
  return p;
});

export async function getTimezone(userId: string): Promise<string> {
  return (await getPrefs(userId)).timezone;
}

export async function getAttendancePolicy(userId: string): Promise<AttendancePolicy> {
  const p = await getPrefs(userId);
  return {
    thresholdPct: p.attendanceThresholdPct,
    lateCountsAs: p.attendanceLateAs === "absent" ? "absent" : "present",
    leaveCountsAs: p.attendanceLeaveAs === "present" ? "present" : p.attendanceLeaveAs === "excluded" ? "excluded" : "absent",
  };
}
