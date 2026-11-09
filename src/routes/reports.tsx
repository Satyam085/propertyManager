import { Await, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { Empty, Money, PageHeader, Section, Stat } from "#/components/pop";
import { getPropertyBreakdown, getYearSummary } from "#/fns/read.functions";
import { fmt, monthLabel, today } from "#/lib/money";

const thisYear = () => Number(today().slice(0, 4));

// Full SSR; the month-by-month summary is awaited, the per-property breakdown streams in.
export const Route = createFileRoute("/reports")({
  ssr: true,
  validateSearch: z.object({
    year: z.number().int().min(2000).max(2100).default(thisYear).catch(thisYear),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => ({
    breakdown: getPropertyBreakdown({ data: deps }),
    months: await getYearSummary({ data: deps }),
  }),
  head: () => ({ meta: [{ title: "Reports · Property Manager" }] }),
  component: Reports,
});

function Reports() {
  const { months, breakdown } = Route.useLoaderData();
  const { year } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const income = months.reduce((s, m) => s + m.income, 0);
  const spent = months.reduce((s, m) => s + m.expenses, 0);
  const peak = Math.max(1, ...months.flatMap((m) => [m.income, m.expenses]));

  return (
    <>
      <PageHeader
        kicker="Income vs expenses"
        title={String(year)}
        actions={
          <div className="flex">
            <button
              aria-label="Previous year"
              className="h-9 border border-line px-3 font-bold"
              onClick={() => navigate({ search: { year: year - 1 } })}
            >
              ←
            </button>
            <button
              aria-label="Next year"
              className="h-9 border border-l-0 border-line px-3 font-bold"
              onClick={() => navigate({ search: { year: year + 1 } })}
            >
              →
            </button>
          </div>
        }
      />
      <div className="grid grid-cols-3 gap-3">
        <Stat
          label="Rent collected"
          value={<Money paise={income} />}
          tone="ok"
          hint="electricity excluded"
        />
        <Stat label="Expenses" value={<Money paise={spent} />} />
        <Stat
          label="Net"
          value={<Money paise={income - spent} />}
          tone={income - spent >= 0 ? "lime" : "bad"}
        />
      </div>

      <Section title="By month">
        <div className="mb-3 flex gap-4 text-xs text-white/60">
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 bg-mint" /> Collected
          </span>
          <span className="flex items-center gap-1.5">
            <i className="inline-block size-2.5 bg-pink" /> Expenses
          </span>
        </div>
        {/* ponytail: CSS bars, no chart library; the table below carries the exact values */}
        <div className="flex h-44 items-end gap-1.5 border-b border-line" aria-hidden>
          {months.map((m) => (
            <div
              key={m.month}
              className="flex h-full flex-1 items-end gap-px"
              title={`${monthLabel(m.month)}: ${fmt(m.income)} in, ${fmt(m.expenses)} out`}
            >
              <div className="flex-1 bg-mint" style={{ height: `${(m.income / peak) * 100}%` }} />
              <div className="flex-1 bg-pink" style={{ height: `${(m.expenses / peak) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="mt-1 flex gap-1.5" aria-hidden>
          {months.map((m) => (
            <span key={m.month} className="flex-1 text-center text-[10px] text-white/40">
              {monthLabel(m.month).slice(0, 1)}
            </span>
          ))}
        </div>
        <table className="mt-6 w-full border border-line bg-surface text-sm">
          <thead>
            <tr className="caps text-left text-white/40">
              <th className="px-4 py-2 font-bold">Month</th>
              <th className="px-4 py-2 text-right font-bold">Collected</th>
              <th className="px-4 py-2 text-right font-bold">Expenses</th>
              <th className="px-4 py-2 text-right font-bold">Net</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {months.map((m) => (
              <tr key={m.month}>
                <td className="px-4 py-2">{monthLabel(m.month)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt(m.income)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{fmt(m.expenses)}</td>
                <td
                  className={`px-4 py-2 text-right font-semibold tabular-nums ${m.income - m.expenses < 0 ? "text-pink" : ""}`}
                >
                  {fmt(m.income - m.expenses)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="By property">
        <Await
          promise={breakdown}
          fallback={<div className="h-24 animate-pulse border border-line bg-surface" />}
        >
          {(rows) =>
            rows.length === 0 ? (
              <Empty>No properties yet</Empty>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {rows.map((p) => (
                  <li key={p.id} className="border border-line bg-surface p-4">
                    <div className="font-serif text-lg font-bold">{p.name}</div>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-white/50">Collected</span>
                      <Money paise={p.income} className="text-mint" />
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-white/50">Expenses</span>
                      <Money paise={p.expenses} />
                    </div>
                    <div className="mt-1 flex justify-between border-t border-line pt-1 font-bold">
                      <span>Net</span>
                      <Money paise={p.income - p.expenses} />
                    </div>
                  </li>
                ))}
              </ul>
            )
          }
        </Await>
      </Section>
    </>
  );
}
