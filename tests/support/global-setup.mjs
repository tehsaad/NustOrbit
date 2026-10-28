import { randomBytes } from "node:crypto";
import { startTestDb, TEST_URL } from "./pg.mjs";

let pg;
export async function setup() {
  pg = await startTestDb();
  Object.assign(process.env, {
    DATABASE_URL: TEST_URL,
    DATABASE_URL_UNPOOLED: TEST_URL,
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64url"),
    BETTER_AUTH_URL: "http://localhost:3100",
    ORBIT_VAULT_KEY: randomBytes(32).toString("base64"),
    CRON_SECRET: randomBytes(32).toString("base64url"),
    GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-secret",
    LMS_ALLOWED_HOSTS: "lms.example.edu",
  });
}
export async function teardown() {
  await pg?.stop();
}
