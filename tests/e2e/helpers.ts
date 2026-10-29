import { expect, type Page } from "@playwright/test";

export const ADMIN = { name: "Test Student", email: "student@example.test", password: "correct-horse-battery-staple" };

export async function signIn(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL("/");
}
