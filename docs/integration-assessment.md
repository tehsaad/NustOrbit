# Integration assessment

What each external system actually allows, as investigated on 2026-10-29 (LMS re-checked the same day with public, credential-free requests). "Verified" means observed directly; "reported" means from public documentation or third-party sources.

## NUST LMS — https://lms.nust.edu.pk/my/

| Question | Finding |
| --- | --- |
| Platform | **Verified Moodle.** The public login page carries Moodle's `M.cfg` bootstrap and theme paths. The public `tool_mobile_get_public_config` endpoint returns site name "NUST Learning Management System", `enablewebservices: 1`, `enablemobilewebservice: 1`, `typeoflogin: 1` (app login by username/password) and no SSO identity providers. |
| TLS | **Verified problem.** The server only completes a TLS 1.2 handshake if the client allows *legacy (unsafe) renegotiation*: it lacks RFC 5746 secure renegotiation. OpenSSL 3, Node.js 18+ and therefore Vercel functions refuse it by default (`ERR_SSL_UNSAFE_LEGACY_RENEGOTIATION_DISABLED`). Orbit's server can't fetch LMS links unless `LMS_LEGACY_TLS=1` is set. That flag enables `SSL_OP_LEGACY_SERVER_CONNECT` **only for requests to the allowlisted LMS host(s)**. Risk: an on-path attacker could exploit the old renegotiation flaw (CVE-2009-3555) to inject a request prefix. They can't read the response or the token. The setting is off by default and is your decision. |
| Authentication | Interactive university login. Orbit does not and will not collect LMS passwords. |
| Official API | Web services and the mobile web service are **enabled** (verified). The standard way to get a token (`login/token.php`, as the Moodle app does) needs your username and password, so Orbit does not use it. Whether *Preferences → Security keys* shows a usable key is **unverified** (it requires signing in). |
| Calendar export | Moodle's documented *Calendar → Export calendar → Get calendar URL* produces a per-user iCalendar link (`export_execute.php?userid=…&authtoken=…&preset_what=…&preset_time=…`). The `authtoken` is a credential for that calendar only. This is the most likely authorized path and is what Orbit implements first. |
| Data available via calendar | Activity due dates, quiz open/close times, course events and course short names (`CATEGORIES`). **No** submission status, grades, feedback, materials or announcements. |
| Data available via web services (if enabled) | Courses, assignments and due dates, submission status, grades and grade items, calendar action events. |
| Restrictions | Respect the site's terms; no scraping, no credential replay. Feed fetches are limited to the allowlisted host, https only, no redirects, with 15 s timeouts and a 5 MB cap. |

**Implemented**: `LmsProvider` interface with `MoodleCalendarFeedProvider` (URL or uploaded `.ics`) and `MoodleWebServiceProvider` (student-generated token). Both are adapters over the same idempotent import.

**Needed to go live**: either upload an exported `.ics` file (works now, no TLS issue), or set `LMS_LEGACY_TLS=1` in Vercel and paste your calendar export URL. With the flag set, a credential-free request to the real LMS succeeds from Node (verified). A real calendar feed and a real web-service token have **not** been tested, because both need your LMS login.

## Qalam — https://qalam.nust.edu.pk/student/dashboard

| Question | Finding |
| --- | --- |
| Platform | Reported to be Odoo-based (third-party sources). **Verified**: requests from this environment get an HTTP 403 Cloudflare bot challenge (`cf-mitigated: challenge`). |
| Official/documented API | None found for students. |
| Automated access | Actively blocked by the bot challenge. Orbit does not attempt to bypass it. |
| Marks / averages / attendance / timetable / results / profile | Visible to students in the portal (reported), but not exposed through any authorized programmatic channel Orbit can use. |

**Implemented**: `QalamProvider` as a **CSV import** for marks (with class averages only when shown), attendance, timetable and semester results. Rows are labelled `Imported`, carry a stable hash as `externalId`, and re-imports update instead of duplicating. Manual entry is available everywhere.

**Needed to go live**: an official student API or export from NUST. Until then, import and manual entry are the supported paths.

## Attendance threshold

No official NUST source was found from this environment. A commonly quoted 75% figure appears only on third-party calculators. Orbit leaves the threshold **unset** until the student enters it, along with a note on where it comes from. LATE and LEAVE handling is configurable too.

## Google Calendar and Gmail

- Official REST APIs with OAuth 2.0 authorization-code flow and PKCE.
- Scopes Orbit requests (one grant per service, least privilege):
  - Calendar: `https://www.googleapis.com/auth/calendar.events` (read, plus create/update only when you explicitly push).
  - Gmail: `https://www.googleapis.com/auth/gmail.readonly`. This is a **restricted** scope. A public production app would need Google verification and a security assessment, so a personal deployment keeps the OAuth app in *Testing* with yourself as a test user.
- In *Testing* status, Google refresh tokens expire after **7 days**, so expect to reconnect weekly unless the app is published.
- **Not available**: no Google OAuth client exists for this project yet. The code is implemented and tested with mocked Google responses only.

## Google Tasks

Official API exists. The adapter is **planned, not built**.

## Google Keep

The Keep API is for Google Workspace **enterprise administrators**, uses service accounts with domain-wide delegation, and does not accept consumer OAuth. **Not usable** for a personal Gmail account. Orbit uses its own notes; a `notes` provider slot exists for a future legitimate integration.

## Samsung / Android alarms

- Samsung Clock has **no public cloud API**. A website cannot create device alarms.
- Android apps can request an alarm through `AlarmClock.ACTION_SET_ALARM`, which needs the `com.android.alarm.permission.SET_ALARM` permission and an installed app. That requires an Android companion app.
- Chrome `intent://` links can only launch activities marked BROWSABLE. Clock apps' set-alarm activities are generally not, so a web link is not a reliable alarm mechanism and Orbit does not claim one.
- **Implemented alternatives**: Orbit push reminders (Web Push through Chrome on Android) and `.ics` downloads with `VALARM` alerts that Samsung Calendar can import. The UI states clearly that these are **reminders, not Samsung Clock alarms**.

## MCP

Orbit does not ship a generic MCP connector. Any future MCP-based integration should be evaluated per provider, read-only by default, with confirmation for externally visible actions.
