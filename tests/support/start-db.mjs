import { startTestDb, TEST_URL } from "./pg.mjs";
const pg = await startTestDb();
console.log(`test db ready ${TEST_URL}`);
process.on("SIGTERM", async () => { await pg.stop(); process.exit(0); });
process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
