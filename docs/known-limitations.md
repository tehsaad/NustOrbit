# Known limitations

Stated plainly so nothing is mistaken for a working live integration.

## Integrations

- **NUST LMS — unverified.** The LMS host didn't respond from the build environment, so the platform (presumed Moodle) and the availability of calendar export / web services at NUST are unconfirmed. The adapters are tested with synthetic Moodle data only. The first real check is pasting your calendar export URL. If Vercel can't reach the LMS, use `.ics` file import.
- **LMS calendar feed** has no submission status, grades, feedback, materials or announcements. Those need the web-service token path, if NUST permits it.
- **Qalam**: no API, and automated access is blocked by a Cloudflare challenge. Import is via CSV you prepare yourself.
- **Google Calendar / Gmail — not connected.** No OAuth client exists yet (`GOOGLE_CLIENT_ID/SECRET` unset). The code is covered by tests with mocked Google responses only. In *Testing* mode, refresh tokens expire every 7 days.
- **Gmail** is read-only by design: no drafting or sending. Detection is keyword-based (no AI model), so expect misses and false positives. Everything stays a suggestion.
- **Google Tasks** adapter not built. **Google Keep** is not available for personal accounts.
- **Samsung Clock alarms** can't be created from the web. A companion Android app is needed (not built).

## Notifications

- **Web Push** works once you enable it per device. iOS needs the Home Screen install. Delivery of real reminders to a real device has not been verified yet.
- **Email** (reminders, password reset) needs `RESEND_API_KEY` and `EMAIL_FROM`, which aren't set. Without them, use the documented recovery procedure.
- **Reminder timing** depends on the GitHub Actions schedule (every 10 min, best-effort, sometimes delayed) once its secrets are set. Until then only the daily Vercel Cron runs. Occurrences missed by more than 24 h are recorded as skipped, not sent late.

## Verification status

- Verified live in production: health/DB, generic sign-in errors, cross-origin rejection, sign-up disabled, sign-in rate limiting (429), Argon2 hashing on Vercel, production migration guard.
- Verified on a local production build with a disposable database (Playwright): setup, sign-in, TOTP enable/verify/disable, every module page, data isolation, session revocation, mobile navigation. No production account existed during the build, so your first sign-in is the first live authenticated check.

## Product

- Letter grades are never predicted, and GPA comes only from grade points you record. Orbit doesn't know NUST's grading scale.
- The target planner assumes the listed weights total 100% and remaining work is scored evenly.
- Calendar drag-and-drop moves Orbit events between days, keeping the time of day. Time-of-day changes go through Edit.
- Calendar push to Google is one-way per event. Deleting in Orbit doesn't delete the Google copy.
- Timetable recurrence is weekly only (no alternate-week labs). Use make-up sessions and cancellations for exceptions.
- Development and production share one Neon database until a dev branch is configured.
- There is no offline mode, by design: the service worker only handles push and caches no private data.
