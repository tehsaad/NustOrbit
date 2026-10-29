/**
 * Heuristic detection of academic signals in email metadata. Email content is
 * untrusted: this only pattern-matches text and never executes or follows
 * instructions found in it. Every result is a *suggestion* the student must
 * confirm before it becomes an assignment or event.
 */
export type EmailSignalKind = "deadline" | "exam" | "timetable-change" | "notice";

export type EmailSignal = {
  kind: EmailSignalKind;
  confidence: "low" | "medium";
  /** Candidate date found in the text, if any. Interpreted in `tz`. */
  dateText?: string;
  reason: string;
};

const UNIVERSITY_DOMAINS = [/(^|\.)nust\.edu\.pk$/i, /(^|\.)seecs\.edu\.pk$/i];

export function isUniversitySender(from: string): boolean {
  const m = /<([^>]+)>/.exec(from);
  const addr = (m ? m[1] : from).trim().toLowerCase();
  const domain = addr.split("@")[1] ?? "";
  return UNIVERSITY_DOMAINS.some((re) => re.test(domain));
}

const DATE_PATTERNS = [
  /\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?,?\s*(\d{4})?\b/i,
  /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?\b/i,
  /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/,
  /\b(today|tomorrow|tonight)\b/i,
];

function findDate(text: string): string | undefined {
  for (const re of DATE_PATTERNS) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return undefined;
}

export function detectSignals(input: { subject: string; snippet: string; from: string }): EmailSignal[] {
  const text = `${input.subject}\n${input.snippet}`.slice(0, 4000);
  const lower = text.toLowerCase();
  const fromUni = isUniversitySender(input.from);
  const dateText = findDate(text);
  const signals: EmailSignal[] = [];
  const conf = (strong: boolean) => (strong && fromUni && dateText ? "medium" : "low") as EmailSignal["confidence"];

  if (/\b(deadline|due (date|on|by)|submission|submit by|last date)\b/.test(lower)) {
    signals.push({ kind: "deadline", confidence: conf(true), dateText, reason: "Mentions a deadline or submission" });
  }
  if (/\b(exam|mid-?term|final|oht|quiz|viva)\b/.test(lower) && /\b(schedule|date|will be (held|conducted)|on)\b/.test(lower)) {
    signals.push({ kind: "exam", confidence: conf(true), dateText, reason: "Mentions an exam or quiz schedule" });
  }
  if (/\b(class|lecture|lab)\b/.test(lower) && /\b(cancel+ed|reschedul|postponed|moved|shifted|makeup|make-up)\b/.test(lower)) {
    signals.push({ kind: "timetable-change", confidence: conf(true), dateText, reason: "Mentions a class change" });
  }
  if (signals.length === 0 && fromUni && /\b(notice|notification|announcement|important)\b/.test(lower)) {
    signals.push({ kind: "notice", confidence: "low", dateText, reason: "University notice" });
  }
  return signals;
}
