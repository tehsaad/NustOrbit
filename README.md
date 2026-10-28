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

## Stack

Next.js 16 (App Router) · TypeScript strict · Tailwind CSS 4 · shadcn/ui · Lucide · Recharts · PostgreSQL (Neon) · Prisma 7 · Zod · Better Auth · Vitest · Playwright · Vercel.

## Quick start (local)

```bash
npm install
vercel link && vercel env pull .env.local   # or copy .env.example → .env.local and fill it
npm run db:migrate                          # applies prisma/migrations
npm run dev                                  # http://localhost:3000
```

Then open `/setup`, enter `SETUP_TOKEN`, and create your account. Setup works only while the database has zero users.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest: unit + integration (integration starts a disposable embedded Postgres; never touches your DB) |
| `npm run test:e2e` | Playwright against a production build + disposable Postgres |
| `npm run db:migrate` / `db:deploy` / `db:status` | Prisma migrations |

## Documentation

- [Architecture](docs/architecture.md)
- [Integration assessment](docs/integration-assessment.md) — what NUST LMS / Qalam / Google / Samsung actually allow
- [Integrations setup](docs/integrations.md)
- [Security](docs/security.md)
- [Deployment & recovery](docs/deployment.md)
- [Known limitations](docs/known-limitations.md)

## License

See [LICENSE](LICENSE).
