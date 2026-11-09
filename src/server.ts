// Worker entry (wrangler `main`). The single auth gate: every request below needs a session,
// pages, server functions, server routes and /files alike. Static assets never reach here.
import handler, { createServerEntry } from "@tanstack/react-start/server-entry";
import { isAuthed } from "./server/auth.server";

const PUBLIC = new Set(["/login", "/api/login"]);

export default createServerEntry({
  async fetch(request, opts) {
    const url = new URL(request.url);
    if (PUBLIC.has(url.pathname) || (await isAuthed(request))) {
      return handler.fetch(request, opts);
    }
    const wantsPage =
      request.method === "GET" &&
      !url.pathname.startsWith("/_serverFn") &&
      (request.headers.get("accept") ?? "").includes("text/html");
    return wantsPage
      ? Response.redirect(new URL("/login", url).toString(), 302)
      : new Response("Unauthorized", { status: 401 });
  },
});
