import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import {
  Empty,
  ErrorText,
  Money,
  PageHeader,
  Select,
  Stat,
  TextButton,
  buttonStyle,
  useAction,
} from "#/components/pop";
import { listExpenses, listProperties, zMonth } from "#/fns/read.functions";
import { deleteEntry } from "#/fns/write.functions";
import { EXPENSE_CATEGORIES, addMonths, monthLabel, thisMonth } from "#/lib/money";
import { useOnline } from "#/lib/outbox";

export const Route = createFileRoute("/expenses")({
  ssr: true,
  validateSearch: z.object({
    month: zMonth.default(thisMonth).catch(thisMonth),
    propertyId: z.string().min(1).max(64).optional().catch(undefined),
    category: z.enum(EXPENSE_CATEGORIES).optional().catch(undefined),
  }),
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [list, props] = await Promise.all([listExpenses({ data: deps }), listProperties()]);
    return { list, props };
  },
  head: () => ({ meta: [{ title: "Expenses · Property Manager" }] }),
  component: Expenses,
});

function Expenses() {
  const { list, props } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const set = (patch: Partial<typeof search>) => navigate({ search: (s) => ({ ...s, ...patch }) });
  const online = useOnline();
  const { run, error, busy } = useAction();

  return (
    <>
      <PageHeader
        kicker="Expenses"
        title={monthLabel(search.month)}
        actions={
          <Link to="/record" search={{ tab: "expense" }} {...buttonStyle({ size: "sm" })}>
            ＋ Expense
          </Link>
        }
      />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex items-end gap-2">
          <button
            aria-label="Previous month"
            className="h-9 border border-line px-3 font-bold"
            onClick={() => set({ month: addMonths(search.month, -1) })}
          >
            ←
          </button>
          <input
            type="month"
            aria-label="Month"
            value={search.month}
            onChange={(e) => e.currentTarget.value && set({ month: e.currentTarget.value })}
            className="h-9 border border-line bg-transparent px-2 font-semibold"
          />
          <button
            aria-label="Next month"
            className="h-9 border border-line px-3 font-bold"
            onClick={() => set({ month: addMonths(search.month, 1) })}
          >
            →
          </button>
        </div>
        <Select
          label="Property"
          value={search.propertyId ?? ""}
          onChange={(e) => set({ propertyId: e.currentTarget.value || undefined })}
          className="min-w-44 flex-1"
        >
          <option value="">All properties</option>
          {props.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select
          label="Category"
          value={search.category ?? ""}
          onChange={(e) =>
            set({ category: (e.currentTarget.value || undefined) as typeof search.category })
          }
          className="min-w-36"
        >
          <option value="">All</option>
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>

      <div className="mt-6 max-w-xs">
        <Stat
          label="Total spent"
          value={<Money paise={list.total} />}
          hint={`${list.rows.length} entries`}
        />
      </div>

      <div className="mt-6">
        {list.rows.length === 0 ? (
          <Empty>No expenses for these filters</Empty>
        ) : (
          <ul className="divide-y divide-line border border-line bg-surface">
            {list.rows.map((x) => (
              <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold capitalize">
                    {x.category}
                    {x.note && (
                      <span className="font-normal normal-case text-white/60"> · {x.note}</span>
                    )}
                  </div>
                  <div className="truncate text-xs text-white/50">
                    {x.spentOn} · {x.propertyName}
                    {x.unitName && ` · room ${x.unitName}`}
                  </div>
                </div>
                <Money paise={x.amount} className="font-bold" />
                <TextButton
                  aria-label="Delete expense"
                  disabled={!online || busy}
                  className="text-[11px]"
                  onClick={() =>
                    confirm("Delete this expense?") &&
                    run(() => deleteEntry({ data: { kind: "expense", id: x.id } }))
                  }
                >
                  ✕
                </TextButton>
              </li>
            ))}
          </ul>
        )}
        <ErrorText error={error} />
      </div>
    </>
  );
}
