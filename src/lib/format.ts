export function fmtTime(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

export function fmtDate(d: Date, tz: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...opts }).format(d);
}

export function fmtDateTime(d: Date, tz: string) {
  return `${fmtDate(d, tz)}, ${fmtTime(d, tz)}`;
}

/** Value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(d: Date | null | undefined, tz: string): string {
  if (!d) return "";
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`;
}

export function toDateInput(d: Date | null | undefined, tz: string): string {
  return toLocalInput(d, tz).slice(0, 10);
}

export function courseLabel(c: { name: string; code?: string | null } | null | undefined): string {
  if (!c) return "No course";
  return c.code && c.code !== c.name ? `${c.code} · ${c.name}` : c.name;
}

export function pct(n: number | null | undefined, dp = 1): string {
  return n == null ? "—" : `${n.toFixed(dp)}%`;
}
