import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Full SSR, plain HTML form: signs in even before JS loads.
export const Route = createFileRoute("/login")({
  ssr: true,
  validateSearch: z.object({ error: z.enum(["wrong", "slow"]).optional().catch(undefined) }),
  head: () => ({ meta: [{ title: "Sign in · Property Manager" }] }),
  component: Login,
});

function Login() {
  const { error } = Route.useSearch();
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <form method="post" action="/api/login" className="w-full max-w-sm">
        <div className="caps text-white/50">Property Manager</div>
        <h1 className="mt-2 font-serif text-[34px] leading-tight font-bold">
          Your rentals,
          <br />
          one ledger<span className="text-lime">.</span>
        </h1>
        <label className="mt-10 block">
          <span className="caps mb-2.5 block text-white/50">Password</span>
          <input
            name="password"
            type="password"
            required
            autoFocus
            autoComplete="current-password"
            className="w-full border-0 border-b border-white/20 bg-transparent pb-1.5 text-[22px] font-bold outline-none focus:border-white"
          />
        </label>
        {error && (
          <p role="alert" className="mt-3 border-l-2 border-bad pl-2 text-sm text-[#f47564]">
            {error === "slow"
              ? "Too many attempts. Wait a minute and try again."
              : "Wrong password."}
          </p>
        )}
        <button
          className="plunk plunk-press mt-8 h-[50px] w-full bg-white text-sm font-bold text-ink"
          style={{ "--edge-r": "#e0e0e0", "--edge-b": "#8a8a8a" } as React.CSSProperties}
        >
          Sign in →
        </button>
      </form>
    </main>
  );
}
