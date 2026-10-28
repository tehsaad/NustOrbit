import { test, expect } from "@playwright/test";
import pg from "pg";
import { randomUUID } from "node:crypto";
import { ADMIN, signIn } from "./helpers";
import { totp } from "./totp";

const SETUP_TOKEN = "e2e-setup-token-0123456789abcdef";
const DB = "postgresql://postgres:password@localhost:54329/orbit_test";

test.describe.configure({ mode: "serial" });

test("private routes redirect to sign-in and health exposes no private data", async ({ page, request }) => {
  await page.goto("/marks");
  await expect(page).toHaveURL(/\/sign-in$/);
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect(Object.keys(await health.json()).sort()).toEqual(["database", "status", "time"]);
  expect((await request.get("/api/cron/sync")).status()).toBe(401);
  expect((await request.get("/api/export/backup")).status()).toBe(401);
});

test("token-gated setup creates the single admin and then closes", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: /Go to setup/ }).click();
  await page.getByLabel("Setup token").fill("wrong-token-wrong-token");
  await page.getByLabel("Your name").fill(ADMIN.name);
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByLabel("Confirm password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("alert").filter({ hasText: /invalid/i }).first()).toBeVisible();

  await page.getByLabel("Setup token").fill(SETUP_TOKEN);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.goto("/setup");
  await expect(page.getByText("Setup is complete")).toBeVisible();
});

test("sign-in rejects bad passwords with a generic message", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Incorrect email or password.")).toBeVisible();
});

test("overview shows onboarding, never sample data", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: /Test/ })).toBeVisible();
  await expect(page.getByText("Start by adding your semester")).toBeVisible();
  await expect(page.getByText("Gmail not connected")).toBeVisible();
  await expect(page.getByText("No graded assessments yet.")).toBeVisible();
});

test("courses, marks and validation errors", async ({ page }) => {
  await signIn(page);
  await page.goto("/courses");
  await page.getByRole("button", { name: "Add course" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save" }).click();
  // HTML5 required blocks submit; fill a whitespace-only name to hit server validation.
  await dialog.getByLabel("Course name").fill("   ");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Required").first()).toBeVisible();
  await dialog.getByLabel("Course name").fill("Data Structures");
  await dialog.getByLabel("Code").fill("CS-212");
  await dialog.getByLabel("Credit hours").fill("4");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Data Structures" })).toBeVisible();

  await page.goto("/marks");
  for (const [title, obtained, max, weight] of [
    ["Quiz 1", "8", "10", "10"],
    ["Midterm", "30", "50", "40"],
    ["Final", "", "100", "50"],
  ]) {
    await page.getByRole("button", { name: "Add assessment" }).first().click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Title").fill(title);
    if (obtained) await d.getByLabel("Obtained marks").fill(obtained);
    await d.getByLabel("Maximum marks").fill(max);
    await d.getByLabel("Weight (% of course)").fill(weight);
    await d.getByRole("button", { name: "Save" }).click();
    await expect(d).toBeHidden();
  }
  // 8/10*10 + 30/50*40 = 8 + 24 = 32 points of 50 graded -> 64%
  await expect(page.getByText("64.0%").first()).toBeVisible();
  await expect(page.getByText("32 pts")).toBeVisible();
  await page.getByLabel("Target course %").fill("80");
  await expect(page.getByText(/Average 96% across the remaining 50%/)).toBeVisible();
});

test("timetable, assignments, tasks and notes", async ({ page }) => {
  await signIn(page);
  await page.goto("/timetable");
  await page.getByRole("button", { name: "Add class" }).first().click();
  let d = page.getByRole("dialog");
  await d.getByLabel("Room").fill("CR-12");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("CR-12").first()).toBeVisible();

  await page.goto("/assignments?filter=all");
  await page.getByRole("button", { name: "Add assignment" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("Title").fill("Lab report 1");
  await d.getByLabel("Deadline").fill("2030-01-15T23:59");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("heading", { name: "Lab report 1" })).toBeVisible();
  await expect(page.getByText("University status unknown")).toBeVisible();

  await page.goto("/tasks");
  await page.getByRole("button", { name: "New task" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel("Task").fill("Read chapter 4");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Read chapter 4")).toBeVisible();
  await page.getByRole("button", { name: "Complete Read chapter 4" }).click();
  await expect(page.getByText("No open tasks")).toBeVisible();

  await page.goto("/notes");
  await page.getByRole("button", { name: "New note" }).first().click();
  await expect(page).toHaveURL(/\/notes\/.+/);
  await page.getByLabel("Title").fill("Lecture 5");
  await page.getByLabel("Note content").fill("# Heaps\n- insert is O(log n)");
  await expect(page.getByText(/Saved \d/)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("tab", { name: "preview" }).click();
  await expect(page.getByRole("heading", { name: "Heaps" })).toBeVisible();
  await page.goto("/notes?q=heaps");
  await expect(page.getByText("Lecture 5")).toBeVisible();

  // Command palette entry point.
  await page.goto("/notes/new");
  await expect(page).toHaveURL(/\/notes\/(?!new)[^/]+$/);
  await expect(page.getByLabel("Title")).toHaveValue("Untitled");
});

test("calendar event, reminder and conflict-free views render", async ({ page }) => {
  await signIn(page);
  await page.goto("/calendar?view=month");
  await page.getByRole("button", { name: "New reminder" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("What").fill("Start revision");
  await d.getByLabel("When").fill("2030-02-01T09:00");
  await d.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Start revision").first()).toBeVisible();
  for (const v of ["day", "week", "month"]) {
    await page.goto(`/calendar?view=${v}`);
    await expect(page.getByRole("tab", { name: v })).toHaveAttribute("aria-selected", "true");
  }
});

test("command palette navigates with the keyboard", async ({ page }) => {
  await signIn(page);
  const palette = page.getByRole("dialog");
  await expect(async () => {
    await page.keyboard.press("Control+k");
    await expect(palette.getByPlaceholder("Go to, create, search…")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await page.keyboard.type("Attendance");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/attendance$/);
});

test("another user's data is not reachable", async ({ page }) => {
  const client = new pg.Client({ connectionString: DB });
  await client.connect();
  const otherUser = randomUUID();
  const noteId = `other-${randomUUID()}`;
  await client.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, 'Other', $2, true, now(), now())`, [otherUser, `${otherUser}@example.test`]);
  await client.query(`INSERT INTO "Note" (id, "userId", title, content, "createdAt", "updatedAt") VALUES ($1, $2, 'Secret of other user', 'classified', now(), now())`, [noteId, otherUser]);
  await client.end();

  await signIn(page);
  // Streaming responses commit a 200 before notFound() runs, so assert on content.
  await page.goto(`/notes/${noteId}`);
  await expect(page.getByRole("heading", { name: "This page drifted out of orbit" })).toBeVisible();
  await expect(page.getByText("classified")).toHaveCount(0);
  await page.goto("/notes?q=Secret");
  await expect(page.getByText("Secret of other user")).toHaveCount(0);
  const backup = await page.request.get("/api/export/backup");
  expect(await backup.text()).not.toContain("classified");
});

test("sessions can be listed and revoked server-side", async ({ page, browser }) => {
  await signIn(page);
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage);

  await page.goto("/settings/security");
  await expect(page.locator("#main").getByText("This device")).toHaveCount(1);
  await page.getByRole("button", { name: "Sign out other sessions" }).click();
  await page.getByRole("button", { name: "Sign out others" }).click();
  await expect(page.getByText(/Signed out \d+ other session/)).toBeVisible();

  await otherPage.goto("/tasks");
  await expect(otherPage).toHaveURL(/\/sign-in$/);
  await other.close();

  // Sign out ends the current session too.
  await page.goto("/");
  await page.getByRole("button", { name: /Test Student/ }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("TOTP two-step verification: enable, sign in with a code, disable", async ({ page }) => {
  await signIn(page);
  await page.goto("/settings/security");
  await page.getByLabel("Confirm with your password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Set up" }).click();
  const secret = (await page.locator("code").first().innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]+=*$/);
  await page.getByLabel("Verification code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("Enabled. Sign-ins require a code")).toBeVisible();

  // Sign out, then sign in: the password step must lead to the code step.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(ADMIN.email);
  await page.getByLabel("Password", { exact: true }).fill(ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in\/two-factor$/);
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByText("That code didn't work.")).toBeVisible();
  await page.getByLabel("Code").fill(totp(secret));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page).toHaveURL("/");

  // Turn it off again so later tests can sign in with a password only.
  await page.goto("/settings/security");
  await page.getByLabel("Confirm with your password").fill(ADMIN.password);
  await page.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Add a second step at sign-in")).toBeVisible();
});
