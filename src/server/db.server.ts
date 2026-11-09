import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema.server";

export const db = drizzle(env.DB, { schema });
export * from "./schema.server";
