/**
 * Static description of every integration Orbit knows about. Runtime state
 * (connected, last sync, errors) lives in IntegrationConnection rows.
 */
export type Capability =
  | "courses"
  | "assignments"
  | "deadlines"
  | "grades"
  | "quizzes"
  | "submissions"
  | "materials"
  | "announcements"
  | "attendance"
  | "timetable"
  | "results"
  | "events.read"
  | "events.write"
  | "email.read"
  | "tasks.read"
  | "notes"
  | "notifications"
  | "alarms";

export type ConnectMethod = "oauth" | "secret-url" | "api-token" | "file-import" | "built-in" | "unavailable";

export type ProviderId = "lms" | "qalam" | "google-calendar" | "gmail" | "google-tasks" | "google-keep" | "web-push" | "email" | "android-companion";

export type ProviderDefinition = {
  id: ProviderId;
  name: string;
  category: "university" | "google" | "notifications" | "device";
  description: string;
  methods: ConnectMethod[];
  capabilities: Capability[];
  /** OAuth scopes requested, with a plain-language reason for each. */
  scopes?: { scope: string; reason: string; sensitive?: boolean }[];
  supportsRefresh?: boolean;
  /** Honest availability note shown on the card. */
  availability: "available" | "needs-configuration" | "import-only" | "planned" | "not-available";
  note: string;
  docs?: string;
};

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: "lms",
    name: "NUST LMS",
    category: "university",
    description: "Deadlines, quiz openings and course events from lms.nust.edu.pk.",
    methods: ["secret-url", "file-import", "api-token"],
    capabilities: ["courses", "deadlines", "assignments", "quizzes", "events.read"],
    availability: "available",
    note:
      "Uses your personal calendar export link (Calendar → Export calendar → Get calendar URL) or an exported .ics file. Submission status and grades are not part of the calendar feed. A Moodle web-service token is supported only if NUST enables user security keys.",
    docs: "https://docs.moodle.org/en/Calendar_export",
  },
  {
    id: "qalam",
    name: "Qalam",
    category: "university",
    description: "Marks, attendance, timetable and results from qalam.nust.edu.pk.",
    methods: ["file-import"],
    capabilities: ["grades", "attendance", "timetable", "results"],
    availability: "import-only",
    note:
      "Qalam has no public student API and blocks automated access. Orbit never asks for your Qalam password. Import CSV files you prepare from your own Qalam pages, or enter data manually.",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    category: "google",
    description: "Show your Google events and optionally push Orbit events to Google.",
    methods: ["oauth"],
    capabilities: ["events.read", "events.write"],
    scopes: [
      { scope: "https://www.googleapis.com/auth/calendar.events", reason: "Read your events and create/update events you explicitly push from Orbit." },
    ],
    supportsRefresh: true,
    availability: "needs-configuration",
    note: "Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for an OAuth client you own.",
    docs: "https://developers.google.com/workspace/calendar/api/guides/overview",
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "google",
    description: "Unread counts, university messages and suggested deadlines from your inbox.",
    methods: ["oauth"],
    capabilities: ["email.read"],
    scopes: [
      {
        scope: "https://www.googleapis.com/auth/gmail.readonly",
        reason: "Read message headers and snippets to count unread mail and spot academic notices. Orbit never sends or deletes mail.",
        sensitive: true,
      },
    ],
    supportsRefresh: true,
    availability: "needs-configuration",
    note: "Restricted scope: while the OAuth app is in Testing mode only listed test users can connect, and Google may expire grants after 7 days.",
    docs: "https://developers.google.com/workspace/gmail/api/guides",
  },
  {
    id: "google-tasks",
    name: "Google Tasks",
    category: "google",
    description: "Two-way task sync with Google Tasks.",
    methods: ["oauth"],
    capabilities: ["tasks.read"],
    availability: "planned",
    note: "The Google Tasks API is available; the adapter is planned but not built yet. Orbit's own task list works today.",
    docs: "https://developers.google.com/workspace/tasks",
  },
  {
    id: "google-keep",
    name: "Google Keep",
    category: "google",
    description: "Import notes from Keep.",
    methods: ["unavailable"],
    capabilities: ["notes"],
    availability: "not-available",
    note: "The Google Keep API is limited to Google Workspace administrators (domain-wide delegation) and is not usable for personal accounts. Orbit uses its own notes.",
    docs: "https://developers.google.com/workspace/keep/api/guides",
  },
  {
    id: "web-push",
    name: "Browser notifications",
    category: "notifications",
    description: "Reminder notifications on this device via Web Push.",
    methods: ["built-in"],
    capabilities: ["notifications"],
    availability: "available",
    note: "Enable per device. On Android, notifications arrive through Chrome even when Orbit is closed.",
  },
  {
    id: "email",
    name: "Email reminders",
    category: "notifications",
    description: "Reminder emails sent to your account address.",
    methods: ["built-in"],
    capabilities: ["notifications"],
    availability: "needs-configuration",
    note: "Requires RESEND_API_KEY and EMAIL_FROM.",
  },
  {
    id: "android-companion",
    name: "Samsung / Android alarms",
    category: "device",
    description: "Create real alarms in the phone's clock app.",
    methods: ["unavailable"],
    capabilities: ["alarms"],
    availability: "planned",
    note:
      "Samsung Clock has no public cloud API and websites cannot set device alarms. Real alarms need a small Android companion app using AlarmClock.ACTION_SET_ALARM. Until then, use Orbit push reminders or download .ics events with alerts.",
    docs: "https://developer.android.com/reference/android/provider/AlarmClock",
  },
];

export function getProvider(id: string): ProviderDefinition | undefined {
  return PROVIDERS.find((p) => p.id === id);
}
