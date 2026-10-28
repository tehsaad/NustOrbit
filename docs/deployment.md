# Deployment and operations

## Current production

| Item | Value |
| --- | --- |
| Vercel project | `teh-saad/nustorbit` (Hobby) |
| URL | https://nustorbit.vercel.app |
| Database | Neon Postgres `nustorbit-db` (Vercel Marketplace, region `sin1` / aws-ap-southeast-1) |
| Runtime | Node.js 24, Fluid Compute |

## Environment variables (names only)

Set in Vercel → Project → Settings → Environment Variables. Values for everything below except Google/Resend were generated during provisioning.

| Name | Required | Notes |
| --- | --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` (+ Neon `PG*`/`POSTGRES_*`) | yes | Injected by the Neon integration |
| `BETTER_AUTH_SECRET` | yes | ≥32 random bytes |
| `BETTER_AUTH_URL` | yes (prod) | `https://nustorbit.vercel.app` |
| `ORBIT_VAULT_KEY` | yes | 32 bytes base64; `ORBIT_VAULT_KEY_VERSION`, `ORBIT_VAULT_KEY_PREVIOUS` for rotation |
| `CRON_SECRET` | yes | Bearer token for `/api/cron/*` (Vercel Cron sends it automatically) |
| `SETUP_TOKEN` | until setup | Remove after creating your account |
| `ORBIT_TIMEZONE` | no | Default `Asia/Karachi` |
| `SESSION_IDLE_DAYS`, `SESSION_ABSOLUTE_DAYS`, `AUTH_SIGNIN_RATE_MAX` | no | Defaults 14 / 60 / 5 |
| `LMS_ALLOWED_HOSTS` | no | Default `lms.nust.edu.pk` |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | for push | Configured |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | for Google | **Not set**; see integrations.md |
| `RESEND_API_KEY`, `EMAIL_FROM` | for email | **Not set** |

## First-time setup

1. Read the setup token: `vercel env pull .env.local` doesn't download sensitive values. Use the copy in the local `.env.local` created during provisioning (`SETUP_TOKEN=…`), or set a new one: `vercel env rm SETUP_TOKEN production && openssl rand -base64 24 | vercel env add SETUP_TOKEN production` and redeploy.
2. Open https://nustorbit.vercel.app/setup, enter the token, your name, email and a 12+ character password.
3. Remove the token: `vercel env rm SETUP_TOKEN production && vercel env rm SETUP_TOKEN preview`.
4. Sign in, open Settings → Security, and enable TOTP.

## Deploying

- `vercel deploy --prod` from a clean checkout, or connect the Git repository (`vercel git connect`) so pushes to `main` deploy automatically.
- The Vercel build runs `npm run vercel-build`: `prisma generate`, then `prisma migrate deploy` **only when `VERCEL_ENV=production`**, then `next build`. Preview builds never migrate.

## Migrations

- Create: `npm run db:migrate -- --name <change>` locally (uses `DATABASE_URL_UNPOOLED`).
- Prefer additive, backwards-compatible changes (add nullable columns or defaults, backfill, then tighten). Never rename or drop in the same deploy that stops using a column.
- `npm run db:status` shows pending migrations. Neon's branching and point-in-time restore cover rollback of data; take a Neon branch before risky migrations.

> Local development currently points at the same Neon database as production (the integration connected all environments). For safer development, create a Neon branch and point `.env.local` at it.

## Scheduled jobs

| Job | Trigger | Endpoint |
| --- | --- | --- |
| Integration sync | Vercel Cron daily 01:00 UTC (`vercel.json`) | `GET /api/cron/sync`, syncing connections idle for >3h, max 20 per run |
| Reminder dispatch | GitHub Actions every 10 min (`.github/workflows/reminders.yml`) + Vercel Cron daily fallback | `GET /api/cron/reminders` |

The GitHub workflow needs two repository secrets:

```bash
gh secret set ORBIT_URL --body "https://nustorbit.vercel.app"
gh secret set CRON_SECRET          # paste the same value as Vercel's CRON_SECRET (from your local .env.local)
```

Scheduled workflows only run from the default branch, can be delayed by GitHub, and are disabled after 60 days without repository activity (re-enable in the Actions tab).

## Health and monitoring

- `GET /api/health` returns `{status, database, time}` (503 if the DB is unreachable).
- Vercel → Logs for runtime logs (JSON, secrets redacted).
- Integration problems appear on the Integrations page (status, last error, sync history).

## Backup and recovery

- **Your data**: Settings → *Full backup (JSON)* (no credentials included); notes export as Markdown.
- **Database**: Neon point-in-time restore / branching from the Neon console (open it with `vercel integration open neon`).
- **Lost vault key**: encrypted integration credentials become unreadable. Reconnect each integration; academic data is unaffected.
- **Leaked `CRON_SECRET`**: rotate it in Vercel and in the GitHub secret, then redeploy.
- **Locked out**: see `security.md` → Recovery.
