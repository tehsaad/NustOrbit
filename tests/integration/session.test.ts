import { describe, expect, it } from "vitest";
import { isPastAbsoluteLifetime } from "@/server/auth/session";
import { isAuthorizedCron } from "@/server/cron-auth";

describe("session lifetime", () => {
  it("enforces the absolute cap regardless of activity", () => {
    const now = new Date("2026-11-01T00:00:00Z");
    expect(isPastAbsoluteLifetime(new Date("2026-10-01T00:00:00Z"), now, 60)).toBe(false);
    expect(isPastAbsoluteLifetime(new Date("2026-08-01T00:00:00Z"), now, 60)).toBe(true);
  });
});

describe("cron secret", () => {
  it("authorizes cron only with the bearer secret", () => {
    const ok = new Request("http://x/api/cron/sync", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    const bad = new Request("http://x/api/cron/sync", { headers: { authorization: "Bearer nope" } });
    expect(isAuthorizedCron(ok)).toBe(true);
    expect(isAuthorizedCron(bad)).toBe(false);
    expect(isAuthorizedCron(new Request("http://x"))).toBe(false);
  });
});
