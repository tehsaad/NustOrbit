// Applies committed Prisma migrations during *production* Vercel builds only.
// Preview builds never migrate, so a preview branch can't alter the production schema.
import { execSync } from "node:child_process";

if (process.env.VERCEL_ENV === "production") {
  console.log("Applying pending migrations (prisma migrate deploy)…");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(`Skipping migrations for VERCEL_ENV=${process.env.VERCEL_ENV ?? "local"}`);
}
