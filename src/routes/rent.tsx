import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Empty, Money, PageHeader, RoomNo, STATUS_TAG, Select, Stat, Tag } from "#/components/pop";
import { getRentSheet, listProperties, zMonth } from "#/fns/read.functions";
import { addMonths, fmt, monthLabel, thisMonth } from "#/lib/money";

// Bad or missing params fall back to defaults instead of erroring: /rent?month=bad → this month.
const searchSchema = z.object({
  month: zMonth.default(thisMonth).catch(thisMonth),
  propertyId: z.string().min(1).max(64).optional().catch(undefined),
  status: z.enum(["all", "due", "paid"]).default("all").catch("all"),
});

export const Route = createFileRoute("/rent")({
  ssr: true,
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [sheet, props] = await Promise.all([getRentSheet({ data: deps }), listProperties()]);
    return { sheet, props };
  },
  head: () => ({ meta: [{ title: "Rent · Property Manager" }] }),
  component: RentSheet,
});

function RentSheet() {
  const { sheet, props } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = (patch: Partial<typeof search>) => navigate({ search: (s) => ({ ...s, ...patch }) });

  return (
    <>
      <PageHeader kicker="Rent sheet" title={monthLabel(search.month)} />

      <div className="grid grid-cols-[auto_1fr_auto] items-end gap-3">
        <button
          aria-label="Previous month"
          className="h-9 border border-line px-3 font-bold hover:bg-raised"
          onClick={() => set({ month: addMonths(search.month, -1) })}
        >
          ←
        </button>
        <label className="block">
          <span className="caps mb-2.5 block text-white/50">Month</span>
          <input
            type="month"
            value={search.month}
            onChange={(e) => e.currentTarget.value && set({ month: e.currentTarget.value })}
            className="w-full border-0 border-b border-white/20 bg-transparent pb-1.5 font-semibold outline-none focus:border-white"
          />
        </label>
        <button
          aria-label="Next month"
          className="h-9 border border-line px-3 font-bold hover:bg-raised"
          onClick={() => set({ month: addMonths(search.month, 1) })}
        >
          →
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-x-6 gap-y-4">
        <Select
          label="Property"
          value={search.propertyId ?? ""}
          onChange={(e) => set({ propertyId: e.currentTarget.value || undefined })}
          className="min-w-48 flex-1"
        >
          <option value="">All properties</option>
          {props.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <div className="flex" role="group" aria-label="Status filter">
          {(["all", "due", "paid"] as const).map((s) => (
            <button
              key={s}
              aria-pressed={search.status === s}
              onClick={() => set({ status: s })}
              className="caps border border-line px-4 py-2.5 text-white/60 aria-pressed:bg-white aria-pressed:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Billed"
          value={<Money paise={sheet.totals.charged} />}
          hint="rent + maint. + other"
        />
        <Stat label="Paid" value={<Money paise={sheet.totals.paid} />} tone="ok" />
        <Stat
          label="Outstanding"
          value={<Money paise={sheet.totals.outstanding} />}
          tone={sheet.totals.outstanding ? "bad" : undefined}
        />
        <Stat
          label="⚡ Electricity"
          value={<Money paise={sheet.totals.elecBilled} />}
          hint={
            sheet.totals.elecDue
              ? `${fmt(sheet.totals.elecDue)} unpaid · not income`
              : "billed · not income"
          }
        />
      </div>

      <div className="mt-6">
        {sheet.rows.length === 0 ? (
          <Empty>No tenancies match.</Empty>
        ) : (
          <ul className="divide-y divide-line border border-line bg-surface">
            {sheet.rows.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <RoomNo room={t.room} />
                <Link
                  to="/tenants/$tenantId"
                  params={{ tenantId: t.id }}
                  className="min-w-0 flex-1"
                >
                  <div className="truncate font-semibold">{t.name}</div>
                  <div className="truncate text-xs text-white/50">
                    {t.propertyName} · billed <Money paise={t.monthCharged} /> · paid{" "}
                    <Money paise={t.monthPaid} />
                  </div>
                  {(t.monthElec > 0 || t.elecDue > 0) && (
                    <div className="truncate text-xs text-white/50">
                      ⚡{" "}
                      {t.monthElec > 0 && (
                        <>
                          bill <Money paise={t.monthElec} /> ·{" "}
                        </>
                      )}
                      {t.elecDue > 0 ? (
                        <span className="text-warn">
                          <Money paise={t.elecDue} /> unpaid
                        </span>
                      ) : (
                        "paid"
                      )}
                    </div>
                  )}
                </Link>
                <div className="flex flex-col items-end gap-1.5">
                  <Money
                    paise={Math.max(0, t.balance)}
                    className={t.balance > 0 ? "font-bold text-pink" : "font-bold text-white/40"}
                  />
                  <Tag tone={STATUS_TAG[t.status]}>{t.status}</Tag>
                </div>
                {t.balance > 0 && (
                  <Link
                    to="/record"
                    search={{ tab: "payment", tenantId: t.id }}
                    className="caps hidden border border-white px-2.5 py-2 hover:bg-white hover:text-ink sm:block"
                  >
                    Collect
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      {search.month !== thisMonth() && (
        <p className="mt-3 text-xs text-white/40">
          Balance is the tenant's total outstanding today, across all months.
        </p>
      )}
    </>
  );
}
