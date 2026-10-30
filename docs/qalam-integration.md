# Qalam integration — architecture assessment (Phase 1)

_Status: assessment complete, implementation not yet started. Nothing here is
verified against a live Qalam account._

## Objective

Let a student connect their own Qalam account and see their real academic
records in Orbit, with credentials kept private and Qalam's security boundaries
respected. Not a CSV-only flow, not an ICS viewer, not a mock.

## What is established (primary evidence)

- **Qalam blocks non-browser clients.** A plain HTTPS GET of `https://qalam.nust.edu.pk/`
  (no spoofed User-Agent, no evasion) returns **HTTP 403**. Earlier probing showed
  `cf-mitigated: challenge` — a Cloudflare managed challenge (anti-bot). This is a
  **platform policy / anti-automation boundary**, not a bug to engineer around.
- **No documented public student API.** No OAuth, no published REST/GraphQL for
  student records. (The "Odoo-based ERP" note in `qalam.ts` is **unverified** — the
  403 prevents fingerprinting — and should be treated as a guess, not fact.)
- **A real browser, logged in by the student, passes the challenge** — that is the
  only observed way in, and it is the student acting as themselves.

## What NUST One's public page establishes (and what it doesn't)

- NUST One is a **native Android app** (Kotlin / Jetpack Compose). It uses the
  student's existing Qalam/LMS login; it does **not** create a separate account.
- It states credentials are **stored encrypted on the device** and that
  "credentials and academic data never leave your device and are not stored on any
  external server."
- Data it surfaces from Qalam: **attendance %, graded assessments, CGPA**
  (feeding a bunk meter, GPA predictor, score roadmap). From LMS (Moodle):
  courses, files, assignment/lab/quiz deadlines.
- **Unknown / not documented:** the exact mechanism by which the app reaches Qalam.
  The on-device model is consistent with a **WebView** in which the student logs in
  (real browser engine → passes Cloudflare), after which the app reads the
  authenticated pages. We do **not** assume its internal implementation.

## Why server-side login is impossible for Orbit (classified blockers)

| Approach | Blocker | Type |
|---|---|---|
| Orbit backend logs into Qalam with username/password | Cloudflare challenge + no API; would require defeating anti-bot and handling a raw university password server-side | **Platform policy** (hard) + prohibited action |
| Orbit web page (browser) fetches Qalam pages | Cross-origin; Qalam sets no CORS headers for nustorbit.vercel.app | **Browser limitation** (CORS) |
| Browser **extension** content script reads the student's own open Qalam pages | none — runs in the student's authenticated browser, same-origin to Qalam, no challenge to bypass | **Permitted** ✅ |

The extension is the web equivalent of NUST One's on-device WebView model, and the
mechanism the spec explicitly sanctions ("evaluate a dedicated browser extension").

## Chosen architecture

**Device-side browser extension (MV3) + an authenticated Orbit ingest endpoint.**
The student logs into Qalam themselves in their own browser; the extension reads
only the DOM of pages they open, normalizes it, and the student reviews it before
it is sent to Orbit over a scoped pairing token (never the password, never cookies).

```
Student's browser (logged into Qalam)
  └─ Orbit extension (MV3)
       ├─ content script  → reads DOM of the page the student is viewing
       ├─ popup           → shows parsed rows + column mapping for REVIEW
       └─ service worker  → POSTs normalized rows to Orbit (Bearer token)
                                 │
Orbit (Next.js)  ◄───────────────┘
  └─ POST /api/integrations/qalam/ingest   (token auth, zod-validated)
       └─ importQalamRecords()  → normalize → upsert into Orbit schema
```

### Hard security lines (binding on implementation)

- **No Qalam credential field anywhere** — not in Orbit, not in the extension. The
  "secure authentication interface" is **Qalam's own login page** in the student's
  browser. The browser session is the SessionManager; the extension only detects
  logged-in vs redirected-to-login (→ the auth-expired state).
- **No Qalam fetching / crawling.** The extension reads only pages the student
  navigates to. No extension-initiated requests to Qalam.
- **Extension host permissions limited to** `qalam.nust.edu.pk` and the Orbit origin.
  **No** `cookies`, `webRequest`, or `<all_urls>` permissions. Only normalized
  academic records leave the browser — never cookies, CSRF or session tokens.
- **Do not drive Qalam with any automation tool** (e.g. claude-in-chrome), even in a
  logged-in tab — that is the same class of action already blocked as circumvention.
- **Never** place a real password in fixtures, tests, logs, memory, or commits.
- No access to other students' records, no MFA/CAPTCHA/Cloudflare bypass, no cookie
  reuse, no credential stuffing, no rate-limit evasion.

### Pairing token (no schema migration needed)

- Token format `<connectionId>.<secret>`; store **SHA-256 of the secret** via the
  existing `putCredential`; compare in constant time; `disconnectIntegration` →
  `deleteCredentials` already revokes it. Token generated from the Qalam card and
  shown **once**.

### Ingest endpoint `/api/integrations/qalam/ingest`

- Bearer token only (no cookies). Zod schema; row cap; ~1 MB body cap; per-connection
  minimum interval (no aggressive syncing). Writes `lastSyncAt` / `lastError`.
- Read the Next route-handler guide under `node_modules/next/dist/docs` first
  (AGENTS.md: this Next version differs from training data).

### Normalization + duplicate/stale safety

- Refactor `importQalamCsv` → shared `importQalamRecords(userId, kind, rows, extractedAt)`
  so CSV **and** the extension use the **same `source` value and the same `key()`**
  (the unique key is `userId_source_externalId`; divergence would duplicate rows for a
  student who uses both paths).
- **Stale guard:** only update a record when incoming `extractedAt >= stored syncedAt`.
- Match courses on **course code** when present (scraped labels won't always fit the
  code-first regex in `courseFor`).
- Every record keeps: source platform, source id (where available), `syncedAt`,
  import status, and official-vs-calculated flag. GPA/what-if stays clearly labelled
  **estimate**, never presented as an official Qalam result.

## Build order (for implementation)

1. This doc (Phase 1). ✅
2. Refactor to `importQalamRecords` + stale guard + code-first course match.
3. Pairing-token verify helper (SHA-256 via `putCredential`, constant-time compare).
4. `/api/integrations/qalam/ingest` route (token auth, zod, caps, interval).
5. MV3 extension in `extension/` (generic alias-based table extractor; popup **review**
   step showing rows + column mapping before send; POST from the **service worker**,
   not the content script, to avoid CORS; exclude `extension/` from the Next tsconfig).
6. Qalam card UI: install/pair steps, last-synced, auth-expired, disconnect+purge.
7. Tests on the embedded-PG infra: bad token, revoked-after-disconnect, oversize body,
   idempotent re-import, stale import doesn't overwrite; extractor tests against
   **synthetic** HTML (labelled synthetic).

## Verification gate

"Done" for the plumbing = built + tested with synthetic fixtures. The integration is
**not** marked verified until the student loads the unpacked extension, runs it on
their own Qalam account, and it works. To build accurate adapters I need **redacted
saved HTML** of the real marks and attendance pages (this is also where the student's
"column uses udu" note gets resolved — in the extractor's column mapping). No
fabricated endpoints or invented successful responses.

## Base-branch note

Production was CLI-deployed from PR #5 (`feat/academics-refocus-qalam-export`), which
is **not merged to `main`**. This work must branch from that branch (stacked), or it
would regress the academics Overview and the existing Qalam export helper on prod.
