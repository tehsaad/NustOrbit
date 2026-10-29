import { sync, type VEvent } from "node-ical";

export type ParsedEvent = {
  uid: string;
  title: string;
  description?: string;
  location?: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  categories: string[];
  url?: string;
  kind: "EXAM" | "QUIZ" | "DEADLINE" | "CLASS" | "OTHER";
};

const MAX_EVENTS = 2000;

function text(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string") return v;
  if (typeof v === "object" && v && "val" in v) return String((v as { val: unknown }).val);
  return String(v);
}

/** Heuristic kind from a title. Used only for display grouping; never as confirmation. */
export function guessKind(title: string): ParsedEvent["kind"] {
  const t = title.toLowerCase();
  if (/\b(quiz|test)\b/.test(t)) return "QUIZ";
  if (/\b(exam|midterm|mid-term|final|oht|end semester|ese)\b/.test(t)) return "EXAM";
  if (/\b(due|deadline|submission|submit|closes|assignment)\b/.test(t)) return "DEADLINE";
  if (/\b(lecture|lab|class|tutorial)\b/.test(t)) return "CLASS";
  return "OTHER";
}

/** Parses an iCalendar document into plain events (non-recurring instances only). */
export function parseIcs(body: string): ParsedEvent[] {
  if (!/BEGIN:VCALENDAR/i.test(body)) throw new Error("Not an iCalendar file");
  const data = sync.parseICS(body);
  const out: ParsedEvent[] = [];
  for (const raw of Object.values(data)) {
    if (!raw || raw.type !== "VEVENT") continue;
    const ev = raw as VEvent;
    const start = ev.start ? new Date(ev.start as unknown as Date) : null;
    if (!start || Number.isNaN(start.getTime())) continue;
    const end = ev.end ? new Date(ev.end as unknown as Date) : new Date(start.getTime());
    const title = text(ev.summary)?.trim() || "Untitled event";
    const cats = Array.isArray(ev.categories) ? ev.categories.map(String) : ev.categories ? [String(ev.categories)] : [];
    out.push({
      uid: String(ev.uid ?? `${title}-${start.toISOString()}`),
      title,
      description: text(ev.description)?.slice(0, 5000),
      location: text(ev.location),
      startsAt: start,
      endsAt: end < start ? start : end,
      allDay: (ev.datetype as string | undefined) === "date",
      categories: cats,
      url: typeof ev.url === "string" ? ev.url : undefined,
      kind: guessKind(title),
    });
    if (out.length >= MAX_EVENTS) break;
  }
  return out;
}

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function stamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 line folding at 75 octets. */
function fold(line: string): string {
  const parts: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 75) {
    let cut = 75;
    while (Buffer.byteLength(rest.slice(0, cut)) > 75) cut--;
    parts.push(rest.slice(0, cut));
    rest = " " + rest.slice(cut);
  }
  parts.push(rest);
  return parts.join("\r\n");
}

export type ExportEvent = { uid: string; title: string; startsAt: Date; endsAt: Date; description?: string | null; location?: string | null; alarmMinutesBefore?: number | null };

/** Builds a downloadable .ics (used for "add to phone calendar" and alarm fallbacks). */
export function buildIcs(events: ExportEvent[], name = "Orbit"): string {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Orbit//Orbit Planner//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(name)}`];
  const now = stamp(new Date());
  for (const e of events) {
    lines.push("BEGIN:VEVENT", `UID:${esc(e.uid)}`, `DTSTAMP:${now}`, `DTSTART:${stamp(e.startsAt)}`, `DTEND:${stamp(e.endsAt)}`, `SUMMARY:${esc(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.alarmMinutesBefore != null && e.alarmMinutesBefore >= 0) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${Math.round(e.alarmMinutesBefore)}M`, "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
