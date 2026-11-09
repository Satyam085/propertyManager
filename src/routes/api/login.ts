import { createFileRoute } from "@tanstack/react-router";
import { checkPassword, loginAllowed, sessionCookie } from "#/server/auth.server";

// Native form POST (works without JS) → cookie + 303 back into the app.
export const Route = createFileRoute("/api/login")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const back = (to: string, cookie?: string) =>
          new Response(null, {
            status: 303,
            headers: { location: to, ...(cookie ? { "set-cookie": cookie } : {}) },
          });
        if (!(await loginAllowed(request))) return back("/login?error=slow");
        const form = await request.formData();
        const password = form.get("password");
        if (typeof password !== "string" || !(await checkPassword(password))) {
          return back("/login?error=wrong");
        }
        return back("/", await sessionCookie());
      },
    },
  },
});
