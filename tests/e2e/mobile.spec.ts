import { test, expect } from "@playwright/test";
import { signIn } from "./helpers";

test("mobile bottom navigation and drawer", async ({ page }) => {
  await signIn(page);
  const quick = page.getByRole("navigation", { name: "Quick" });
  await expect(quick).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
  await quick.getByRole("link", { name: "Timetable" }).click();
  await expect(page).toHaveURL(/\/timetable$/);
  await expect(quick.getByRole("link", { name: "Timetable" })).toHaveAttribute("aria-current", "page");
  // A click that lands before hydration is a no-op, so retry until the drawer opens.
  await expect(async () => {
    await quick.getByRole("button", { name: "More" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await page.getByRole("dialog").getByRole("link", { name: "Notes" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  // No horizontal overflow at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("no page scrolls horizontally at phone width", async ({ page }) => {
  await signIn(page);
  for (const path of ["/", "/academics", "/courses", "/marks", "/assignments", "/attendance", "/timetable", "/calendar", "/calendar?view=month", "/tasks", "/notes", "/integrations", "/settings", "/settings/security"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `${path} overflows horizontally`).toBeLessThanOrEqual(1);
  }
});
