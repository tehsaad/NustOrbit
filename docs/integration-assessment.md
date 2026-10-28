# Integration assessment

What each external system actually allows, as investigated on 2026-10-29. "Verified" means observed directly; "reported" means from public documentation or third-party sources.

## NUST LMS — https://lms.nust.edu.pk/my/

| Question | Finding |
| --- | --- |
| Platform | **Presumed Moodle, not verified.** The URL structure (`/my/`) matches Moodle. From this build environment the host did not respond at all (connection timed out), so the platform, version and enabled features could not be confirmed. Vercel's servers may or may not be able to reach it either. |
| Authentication | Interactive university login. Orbit does not and will not collect LMS passwords. |
| Official API | Moodle ships REST web services (`/webservice/rest/server.php`). Whether NUST enables them for students, and whether students can create their own keys under *Preferences → Security keys*, is **unknown**. The standard token endpoint (`login/token.php`) takes a username and password, so Orbit does not use it. |
| Calendar export | Moodle's documented *Calendar → Export calendar → Get calendar URL* produces a per-user iCalendar link (`export_execute.php?userid=…&authtoken=…&preset_what=…&preset_time=…`). The `authtoken` is a credential for that calendar only. This is the most likely authorized path and is what Orbit implements first. |
| Data available via calendar | Activity due dates, quiz open/close times, course events and course short names (`CATEGORIES`). **No** submission status, grades, feedback, materials or announcements. |
| Data available via web services (if enabled) | Courses, assignments and due dates, submission status, grades and grade items, calendar action events. |
| Restrictions | Respect the site's terms; no scraping, no credential replay. Feed fetches are limited to the allowlisted host, https only, no redirects, with 15 s timeouts and a 5 MB cap. |

**Implemented**: `LmsProvider` interface with `MoodleCalendarFeedProvider` (URL or uploaded `.ics`) and `MoodleWebServiceProvider` (student-generated token). Both are adapters over the same idempotent import.

**Needed to go live**: the student opens the LMS, generates their calendar export URL and pastes it on the Integrations page. Optionally, if *Security keys* exist, they paste the "Moodle mobile web service" key to get submissions and grades. Both paths are **unverified against NUST** until a real link is connected.

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
