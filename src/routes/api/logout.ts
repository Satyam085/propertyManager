import { createFileRoute } from "@tanstack/react-router";
import { clearedCookie } from "#/server/auth.server";

export const Route = createFileRoute("/api/logout")({
  server: {
    handlers: {
      POST: () =>
        new Response(null, {
          status: 303,
          headers: { location: "/login", "set-cookie": clearedCookie },
        }),
    },
  },
});
