import { randomUUID } from "node:crypto";
import { db } from "@/server/db";

export async function makeUser(label = "u") {
  const id = randomUUID();
  await db.user.create({ data: { id, name: `Test ${label}`, email: `${label}-${id.slice(0, 8)}@example.test`, emailVerified: true } });
  return id;
}

export const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Synthetic LMS//EN",
  "BEGIN:VEVENT",
  "UID:501@lms.example.edu",
  "SUMMARY:Lab 4 is due",
  "DTSTART:20261110T185900Z",
  "DTEND:20261110T185900Z",
  "CATEGORIES:CS-212",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:502@lms.example.edu",
  "SUMMARY:Quiz 3 opens",
  "DTSTART:20261112T040000Z",
  "DTEND:20261112T050000Z",
  "CATEGORIES:MATH-101",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");
