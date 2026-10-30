# Integrations: setup and operation

All integrations are managed at **/integrations**. Each card shows capabilities, requested permissions, connection status, freshness, last error and sync history. Credentials are encrypted server-side (see `security.md`) and never sent to the browser.

## Common rules

- **Idempotent sync**: every imported row has a `(userId, source, externalId)` key; re-syncs update rows in place.
- **Concurrency**: a connection-level lease (`syncLockedUntil`) means cron and manual syncs can't overlap.
- **Failures**: auth failures set `NEEDS_REAUTH` and pause syncing until you reconnect. Outages set `ERROR`, keep the last good data, and retry on the next run. One provider failing never blocks another.
- **Freshness**: cards and the Overview show "Synced Xm ago", or "Never synced". Nothing is shown as live unless it came from a successful sync.
- **Disconnect**: deletes stored credentials, revokes Google grants at Google, and optionally deletes the data imported from that source.

## NUST LMS

**Recommended — sign in with your LMS account.** Integrations → NUST LMS → **Connect NUST account**. Enter your LMS username and password. Orbit exchanges them once with the LMS via Moodle's official mobile login (`login/token.php`) for an access token, then discards the password; only the encrypted token is kept. This brings in courses, assignments, grades, submission status and deadlines. It needs `LMS_LEGACY_TLS=1` set on the server (NUST's TLS is outdated). Disconnect any time to delete the token.

Password-free alternatives (deadlines only, no grades):

1. In the LMS, open **Calendar → Export calendar**.
2. Choose *All events* and *Recent and next 60 days*, then click **Get calendar URL**.
3. In Orbit, open **Integrations → NUST LMS → Connect calendar link** and paste the URL. Orbit saves it encrypted and runs a first sync.
4. Optional: if the LMS shows **Preferences → Security keys** with a *Moodle mobile web service* key, use **Web-service token** to also import submission status and grades.
5. No link available? Export an `.ics` file and use **Import .ics**.

**TLS note:** NUST's LMS server needs legacy TLS renegotiation, which Node.js refuses by default. Pasted links therefore fail with an "outdated TLS" message unless `LMS_LEGACY_TLS=1` is set in Vercel (it applies only to the LMS host; see integration-assessment.md for the risk). File import is unaffected.

Allowed hosts are set by `LMS_ALLOWED_HOSTS` (default `lms.nust.edu.pk`). Sync runs daily via Vercel Cron and on demand with **Sync now**.

Mapping: course short names (`CATEGORIES`) become courses; "… is due" events become assignments with university status **Unknown** (a calendar can't prove submission); quizzes, exams and other events become read-only calendar events.

## Qalam

Use **Integrations → Qalam → Import CSV**. The column templates are shown in the dialog:

| Kind | Columns |
| --- | --- |
| marks | `course,assessment,category,obtained,max,weight,class_average` |
| attendance | `course,date,time,status,sessions` (status: PRESENT/ABSENT/LEAVE/LATE; date: YYYY-MM-DD; optional time HH:mm separates two classes on one day — without it, same-day rows are kept apart by their order in the file) |
| deadlines | `course,title,due,max,weight,url` (due: `YYYY-MM-DD HH:mm` local time; submission status stays Unknown) |
| timetable | `course,day,start,end,room,instructor,kind` |
| results | `term,course,credit_hours,grade,grade_points` |

Invalid rows are skipped and reported by row number. Courses are matched by code (e.g. `CS-212`) or name, and created if missing.

## Google Calendar and Gmail

Requires an OAuth client you own:

1. In Google Cloud Console, create a project and enable the **Google Calendar API** and **Gmail API**.
2. Configure the **OAuth consent screen**: External, publishing status *Testing*, and add your Google account as a test user. Add the scopes `calendar.events` and `gmail.readonly`.
3. Create **Credentials → OAuth client ID → Web application** with the authorized redirect URI `https://<your-domain>/api/integrations/google/callback`.
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in Vercel (Production), then redeploy.
5. In Orbit, open Integrations and click **Connect Google Calendar** and/or **Connect Gmail**. Each is a separate grant.

Behaviour:
- Calendar sync reads your primary calendar from −14 to +90 days. Google events are read-only in Orbit.
- **Push to Google** is available on Orbit-owned events and always asks for confirmation. Updates send `If-Match` with the stored ETag, so if the event changed in Google, Orbit stops instead of overwriting it.
- Gmail is read live (headers + snippet). Detected deadlines and exams are suggestions. You choose **Add as suggestion**, and the item stays labelled *Suggested* until you confirm it. Orbit never sends, drafts or deletes email.
- In *Testing* mode, Google expires refresh tokens after 7 days. Orbit then marks the connection **Needs reconnecting**.

## Notifications

- **Web Push**: VAPID keys are configured in production. On each device, open Integrations → Browser notifications → **Enable on this device**. iOS requires adding Orbit to the Home Screen first.
- **Email**: set `RESEND_API_KEY` and `EMAIL_FROM` (a verified sender domain). Email also enables password-reset messages.
- **Dispatch**: `/api/cron/reminders` runs every 10 minutes via the GitHub Actions workflow `.github/workflows/reminders.yml`, plus a daily Vercel Cron fallback.

## Samsung / Android

Orbit cannot create Samsung Clock alarms. Use push reminders, or download `.ics` (Integrations → Samsung / Android alarms, or per event in Calendar) and import it into Samsung Calendar, whose alerts fire on the phone. A companion Android app using `AlarmClock.ACTION_SET_ALARM` is the path to real alarms (not built).

## Adding a provider

1. Add a `ProviderDefinition` to `src/server/integrations/registry.ts` (id, capabilities, scopes with reasons, availability note).
2. Implement an adapter that maps provider data to Orbit models with `source` + stable `externalId`, and throws `ProviderAuthError`, `ProviderUnavailableError` or `ProviderConfigError` as appropriate.
3. Register its sync handler in `src/server/integrations/handlers.ts`.
4. Store secrets only through `putCredential()`.
5. Add integration tests with mocked provider responses (see `tests/integration`).
