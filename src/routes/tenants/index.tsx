import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  RoomNo,
  buttonStyle,
  Empty,
  formValues,
  Money,
  PageHeader,
  STATUS_TAG,
  Tag,
} from "#/components/pop";
import { listTenants } from "#/fns/read.functions";

export const Route = createFileRoute("/tenants/")({
  ssr: true,
  validateSearch: z.object({
    status: z.enum(["active", "past"]).default("active").catch("active"),
    q: z.string().trim().max(100).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => listTenants({ data: deps }),
  head: () => ({ meta: [{ title: "Tenants · Property Manager" }] }),
  component: Tenants,
});

function Tenants() {
  const rows = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  return (
    <>
      <PageHeader
        kicker={`${rows.length} ${search.status}`}
        title="Tenants"
        actions={
          <Link to="/tenants/new" {...buttonStyle({})}>
            ＋ Add tenant
          </Link>
        }
      />
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex" role="group" aria-label="Tenancy status">
          {(["active", "past"] as const).map((s) => (
            <button
              key={s}
              aria-pressed={search.status === s}
              onClick={() => navigate({ search: (p) => ({ ...p, status: s }) })}
              className="caps border border-line px-4 py-2.5 text-white/60 aria-pressed:bg-white aria-pressed:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
        <form
          className="min-w-48 flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            const q = formValues(e.currentTarget).str("q");
            void navigate({ search: (p) => ({ ...p, q: q || undefined }) });
          }}
        >
          <input
            name="q"
            type="search"
            defaultValue={search.q}
            placeholder="Search name or phone"
            aria-label="Search tenants"
            className="w-full border border-edge bg-surface px-3 py-2.5 text-sm outline-none focus:border-white"
          />
        </form>
      </div>
      {rows.length === 0 ? (
        <Empty>{search.q ? `No tenants match "${search.q}"` : `No ${search.status} tenants`}</Empty>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {rows.map((t) => (
            <li key={t.id}>
              <Link
                to="/tenants/$tenantId"
                params={{ tenantId: t.id }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-raised"
              >
                <RoomNo room={t.room} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{t.name}</div>
                  <div className="truncate text-xs text-white/50">
                    {t.propertyName} · {t.phone || "no phone"}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="font-bold">
                    <Money paise={t.rent} />
                    <span className="text-xs font-normal text-white/40">/mo</span>
                  </span>
                  {search.status === "active" && <Tag tone={STATUS_TAG[t.status]}>{t.status}</Tag>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
