// Disposable local Postgres for integration/E2E tests (never the production DB).
import EmbeddedPostgres from "embedded-postgres";
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

export const TEST_PORT = Number(process.env.ORBIT_TEST_PG_PORT ?? 54329);
export const TEST_DB = "orbit_test";
export const TEST_URL = `postgresql://postgres:password@localhost:${TEST_PORT}/${TEST_DB}`;

export async function startTestDb() {
  const dir = path.resolve(".pg-test");
  rmSync(dir, { recursive: true, force: true });
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "password", port: TEST_PORT, persistent: false, onLog: () => {} });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(TEST_DB);
  execSync("npx prisma migrate deploy", { stdio: "ignore", env: { ...process.env, DATABASE_URL: TEST_URL, DATABASE_URL_UNPOOLED: TEST_URL } });
  return pg;
}
