import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { useEffect, type ReactNode } from "react";
import { Tag } from "#/components/pop";
import { flush, useOnline, useOutbox } from "#/lib/outbox";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0d0d0d" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black" },
      { title: "Property Manager" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
    ],
  }),
  shellComponent: RootDocument,
  component: AppShell,
  notFoundComponent: () => <p className="p-8 text-white/70">Page not found.</p>,
});

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{ position: "bottom-left" }}
            plugins={[{ name: "Tanstack Router", render: <TanStackRouterDevtoolsPanel /> }]}
          />
        )}
        <Scripts />
      </body>
    </html>
  );
}

const NAV = [
  { to: "/", label: "Home" },
  { to: "/rent", label: "Rent" },
  { to: "/tenants", label: "Tenants" },
  { to: "/properties", label: "Properties" },
  { to: "/expenses", label: "Expenses" },
  { to: "/reports", label: "Reports" },
] as const;

function AppShell() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const router = useRouter();
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    const sync = () =>
      void flush().then((n) => {
        if (n) void router.invalidate();
      });
    sync();
    addEventListener("online", sync);
    return () => removeEventListener("online", sync);
  }, [router]);

  if (path === "/login") return <Outlet />;

  return (
    <div className="md:flex">
      <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line p-5 md:flex">
        <Brand />
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              activeOptions={{ exact: n.to === "/" }}
              className="px-3 py-2 text-sm font-semibold text-white/60 hover:text-white data-[status=active]:bg-white data-[status=active]:text-ink"
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <Link
          to="/record"
          className="plunk plunk-press mt-6 bg-lime py-3 text-center text-[13px] font-bold text-ink"
          style={{ "--edge-r": "#a0b22d", "--edge-b": "#727f20" } as React.CSSProperties}
        >
          ＋ Record
        </Link>
        <div className="mt-auto flex flex-col items-start gap-3">
          <SyncStatus />
          <LogoutButton />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-ink/95 px-4 py-3 backdrop-blur md:hidden">
          <Brand />
          <SyncStatus />
        </header>
        <main className="mx-auto max-w-5xl px-4 pt-6 pb-28 md:px-8 md:pt-10 md:pb-12">
          <Outlet />
        </main>
      </div>

      <MobileNav />
    </div>
  );
}

const Brand = () => (
  <Link to="/" className="font-serif text-xl font-bold tracking-tight">
    property<span className="text-lime">.</span>
  </Link>
);

function SyncStatus() {
  const online = useOnline();
  const pending = useOutbox().length;
  return (
    <div className="flex items-center gap-2">
      {!online && <Tag tone="warn">Offline</Tag>}
      {pending > 0 && (
        <Link to="/sync">
          <Tag tone="info">{pending} pending</Tag>
        </Link>
      )}
    </div>
  );
}

const LogoutButton = () => (
  // tells the service worker to drop cached pages/data from this device
  <form
    method="post"
    action="/api/logout"
    onSubmit={() => navigator.serviceWorker?.controller?.postMessage("logout")}
  >
    <button className="text-xs font-semibold text-white/50 hover:text-white">Log out</button>
  </form>
);

function MobileNav() {
  const tab =
    "flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold text-white/50 data-[status=active]:text-white";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex items-stretch border-t border-line bg-ink pb-[env(safe-area-inset-bottom)] md:hidden">
      <Link to="/" activeOptions={{ exact: true }} className={tab}>
        Home
      </Link>
      <Link to="/rent" className={tab}>
        Rent
      </Link>
      <div className="flex flex-1 items-center justify-center">
        <Link
          to="/record"
          aria-label="Record an entry"
          className="plunk plunk-press flex size-11 items-center justify-center bg-lime text-2xl font-bold text-ink"
          style={{ "--edge-r": "#a0b22d", "--edge-b": "#727f20" } as React.CSSProperties}
        >
          ＋
        </Link>
      </div>
      <Link to="/tenants" className={tab}>
        Tenants
      </Link>
      <details className="relative flex flex-1">
        <summary className={`${tab} cursor-pointer list-none`}>More</summary>
        <div className="absolute right-2 bottom-full mb-2 flex w-44 flex-col border border-line bg-raised p-1">
          {NAV.slice(3).map((n) => (
            <Link key={n.to} to={n.to} className="px-3 py-2.5 text-sm font-semibold text-white/80">
              {n.label}
            </Link>
          ))}
          <Link to="/sync" className="px-3 py-2.5 text-sm font-semibold text-white/80">
            Sync queue
          </Link>
          <div className="px-3 py-2.5">
            <LogoutButton />
          </div>
        </div>
      </details>
    </nav>
  );
}
