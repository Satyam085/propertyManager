import "@tanstack/react-start/server-only";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { FILE_OWNERS } from "#/lib/money";
import { db, files } from "./db.server";

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;

export async function storeFile(form: FormData) {
  const str = (k: string) => {
    const v = form.get(k);
    return typeof v === "string" ? v : "";
  };
  const ownerType = str("ownerType");
  const ownerId = str("ownerId");
  const file = form.get("file");
  if (!FILE_OWNERS.includes(ownerType as (typeof FILE_OWNERS)[number]) || !ownerId) {
    throw new Error("Invalid owner");
  }
  if (!(file instanceof File) || file.size === 0) throw new Error("No file");
  if (file.size > MAX_BYTES) throw new Error("File is larger than 10 MB");
  if (!ALLOWED.test(file.type)) throw new Error("Only images and PDFs are allowed");

  const id = crypto.randomUUID();
  const key = `${ownerType}/${ownerId}/${id}`;
  await env.FILES.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await db.insert(files).values({
    id,
    ownerType: ownerType as (typeof FILE_OWNERS)[number],
    ownerId,
    key,
    name: file.name.slice(0, 200),
    contentType: file.type,
  });
  return { id, key };
}

export async function removeFile(id: string) {
  const [row] = await db.delete(files).where(eq(files.id, id)).returning();
  if (row) await env.FILES.delete(row.key);
}

export async function serveFile(key: string) {
  const obj = await env.FILES.get(key);
  if (!obj) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("etag", obj.httpEtag);
  // keys are random and never rewritten, so the browser and service worker can keep them forever
  headers.set("cache-control", "private, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(obj.body, { headers });
}
