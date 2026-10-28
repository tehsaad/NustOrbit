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
  await quick.getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Notes" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  // No horizontal overflow at phone width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
