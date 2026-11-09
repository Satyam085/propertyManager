import { defineConfig } from "drizzle-kit";

// Generates SQL into ./drizzle; wrangler applies it (`vp run db:migrate:local|remote`).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/server/schema.server.ts",
  out: "./drizzle",
});
