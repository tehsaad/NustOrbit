# Orbit — Qalam importer (browser extension)

Device-side companion for Orbit. It reads **your own** open Qalam pages in your
logged-in browser and sends the academic data to your Orbit account. It never
sees or stores your Qalam password, never logs in for you, and never crawls or
makes background requests to Qalam — it only reads the page you are looking at,
when you click **Read this page**.

See `../docs/qalam-integration.md` for the architecture and why this (not
server-side login) is the compliant design.

## Install (unpacked, for development)

1. Open `chrome://extensions` in Chrome/Edge/Brave.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension/` folder.

## Pair with Orbit

1. In Orbit, go to **Integrations → Qalam → Connect the browser extension** and
   click **Create pairing token**. Copy the token (shown once).
2. Click the extension icon, paste your Orbit URL (e.g. `https://nustorbit.vercel.app`)
   and the pairing token, and **Save pairing**.

The token authorizes imports for your account only. Revoke it anytime by
disconnecting Qalam in Orbit, or create a new one (which replaces the old).

## Use

1. Log into Qalam yourself and open a page (marks, attendance, timetable,
   results, or deadlines).
2. Open the extension, choose the page type (or **Auto-detect**), click
   **Read this page**.
3. **Review** the detected rows and the column mapping shown in the popup.
4. Click **Send to Orbit**.

## Calibration (important)

The column aliases in `extractor.js` are best-effort guesses — Qalam's real
column names haven't been confirmed yet. If **Read this page** finds a table but
no recognizable data, or the mapping looks wrong, the fix is to adjust the
`ALIASES` map in `extractor.js`. To make that accurate, save the page's HTML
(right-click → *Save as*, or copy the table) with personal IDs redacted and
share it with Orbit so the aliases and a targeted adapter can be added.

## Local development

Host permissions are set for `nustorbit.vercel.app`. To point the extension at a
local Orbit (`http://localhost:3000`), add `"http://localhost:3000/*"` to
`host_permissions` in `manifest.json` and reload the extension.

## What it can and cannot access

- Permissions: `storage` (to remember your Orbit URL + token) and `activeTab`.
- Host access: `qalam.nust.edu.pk` (to read the page you open) and your Orbit
  origin (to send rows). **No** `cookies`, `webRequest`, or all-sites access.
- Only normalized academic rows leave your browser — never cookies, tokens, or
  credentials.
