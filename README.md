# Orbit

**Everything in sync. Nothing forgotten.**

Orbit is a private, single-user academic and productivity command center for a NUST student: classes, deadlines, marks, attendance, calendar, tasks, notes and reminders in one place, with honest source labels and freshness on every item.

> Orbit is an independent student-built tool. It is **not** an official NUST application and is not affiliated with NUST, its LMS, or Qalam.

Production: https://nustorbit.vercel.app (private; registration is disabled)

## What it does

| Area | Highlights |
| --- | --- |
| Overview | Live clock, next class countdown, today's agenda across sources, deadlines, exams, recent marks, attendance, tasks, Gmail summary, reminders, source freshness |
| Academics / Courses | Per-course standing, attendance risk, official grades, credit hours |
| Marks | Raw % vs weighted contribution vs official grade kept separate; target planner ("need X% on remaining Y%"); class-average comparison only when provided (manual input labelled); semester GPA / CGPA only from grade points you record |
| Assignments | Filters (pending, today, week, overdue, submitted, graded); university status separate from your own progress; checklists, notes, original links; email-derived items stay "Suggested" until confirmed |
| Timetable | Weekly recurrence in a configurable timezone, cancellations / make-up sessions, conflict detection, next-class countdown |
| Attendance | User-configured threshold (never assumed), late/leave policy, allowable absences / recovery sessions, history with source labels |
| Calendar | Day / week / month; classes, deadlines, exams, Google events, tasks, reminders; conflict highlighting; drag-to-reschedule for Orbit-owned events; confirmed push to Google with If-Match protection |
| Tasks, Notes | Prioritised tasks linked to courses/assignments; Markdown notes with autosave, tags, folders, pins, search, export |
| Reminders | One-time / recurring; push, email, in-app; idempotent delivery history with retries; `.ics` export with alerts for phone calendars |
| Integrations | Registry with capabilities, permissions, freshness, sync history, connect/disconnect, encrypted credentials |
| Security | Argon2id, DB sessions with idle + absolute expiry, revocation UI, TOTP 2FA, rate limiting, audit log |

## Status (2026-10-29)

| Area | State |
| --- | --- |
| Production | Healthy at https://nustorbit.vercel.app (Git-connected; `main` deploys automatically) |
| First account | Not created yet. Run `npm run admin:invite -- --email you@example.com` and open the printed link (single use, 24 h) |
| Tests | 83 unit + integration, 13 Playwright E2E; all passing locally and in GitHub CI |
| NUST LMS | Verified Moodle with web services enabled. Live sync needs `LMS_LEGACY_TLS=1` (the server's TLS is outdated) or `.ics` upload. Not yet tested with real student data |
| Qalam | CSV import (marks, attendance, timetable, results, deadlines). No API; automated access blocked |
| Google Calendar / Gmail | Implemented; needs `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` |
| Reminders | Dispatch every 10 min via GitHub Actions (verified run) + daily Vercel Cron. Push needs per-device opt-in; email not configured |

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · shadcn/ui · Lucide · Recharts · PostgreSQL (Neon) · Prisma 7 · Zod · Better Auth · Vitest · Playwright · Vercel.

## Quick start (local)

```bash
npm install
vercel link && vercel env pull .env.local   # or copy .env.example → .env.local and fill it
# ⚠ Sensitive Vercel variables (CRON_SECRET and other secrets) are NOT downloaded by env pull.
#   For this deployment a private copy lives in ~/.config/orbit/production-secrets.env.
npm run db:migrate                          # applies prisma/migrations
npm run dev                                  # http://localhost:3000
```

Create the single account with a one-time link (works only while the database has zero users):

```bash
npm run admin:invite -- --email you@example.com   # prints https://…/claim#<single-use token>, valid 24 h
```

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest: unit + integration (integration starts a disposable embedded Postgres; never touches your DB) |
| `npm run test:e2e` | Playwright against a production build + disposable Postgres |
| `npm run db:migrate` / `db:deploy` / `db:status` | Prisma migrations |
| `npm run admin:invite -- --email …` | Issue the one-time first-account link (`--revoke` to cancel) |

## Documentation

- [Architecture](docs/architecture.md)
- [Integration assessment](docs/integration-assessment.md) — what NUST LMS / Qalam / Google / Samsung actually allow
- [Integrations setup](docs/integrations.md)
- [Security](docs/security.md)
- [Deployment & recovery](docs/deployment.md)
- [Known limitations](docs/known-limitations.md)

## License

See [LICENSE](LICENSE).
