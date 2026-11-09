import { Await, Link, createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Card, Empty, Money, PageHeader, RoomNo, Section, Stat, Tag } from "#/components/pop";
import { getEndingSoon, getKpis, getOverdue, getRecentPayments } from "#/fns/read.functions";
import { METHOD_LABEL, fmt, monthLabel, ordinal, today } from "#/lib/money";

// Full SSR + streaming: KPIs are awaited (one cheap round of aggregates) so the first byte has
// the numbers; the lists are returned as un-awaited promises and stream in via <Await>.
export const Route = createFileRoute("/")({
  ssr: true,
  loader: async () => {
    const kpis = await getKpis(); // also raises this month's charges, so it goes first
    return {
      kpis,
      overdue: getOverdue(),
      endingSoon: getEndingSoon(),
      recent: getRecentPayments(),
    };
  },
  component: Dashboard,
});

function Dashboard() {
  const { kpis, overdue, endingSoon, recent } = Route.useLoaderData();
  const rate = kpis.expected ? Math.round((kpis.collected / kpis.expected) * 100) : 0;
  return (
    <>
      <PageHeader kicker={monthLabel(kpis.month)} title="Overview" />

      <Card edge="lime" className="bg-raised">
        <div className="caps text-white/50">Collected this month</div>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
          <Money
            paise={kpis.collected}
            className="text-4xl font-extrabold tracking-tight text-lime"
          />
          <span className="text-sm text-white/50">
            of <Money paise={kpis.expected} /> billed
          </span>
        </div>
        <div
          className="mt-4 h-1.5 bg-white/10"
          role="progressbar"
          aria-valuenow={rate}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full bg-lime" style={{ width: `${Math.min(100, rate)}%` }} />
        </div>
      </Card>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Outstanding"
          value={<Money paise={kpis.outstanding} />}
          tone={kpis.outstanding > 0 ? "bad" : undefined}
          hint={
            kpis.elecDue ? `rent · ${fmt(kpis.elecDue)} electricity unpaid` : "rent, all months"
          }
        />
        <Stat label="Expenses" value={<Money paise={kpis.expenses} />} hint="this month" />
        <Stat
          label="Net"
          value={<Money paise={kpis.net} />}
          tone={kpis.net >= 0 ? "ok" : "bad"}
          hint="collected − expenses"
        />
        <Stat
          label="Occupancy"
          value={`${kpis.occupied}/${kpis.units}`}
          hint={`rooms let · ${kpis.tenants} tenant${kpis.tenants === 1 ? "" : "s"}`}
        />
      </div>

      <Section
        title="Overdue"
        actions={
          <Link
            to="/rent"
            search={{ status: "due" }}
            className="text-xs font-semibold text-white/60 hover:text-white"
          >
            Rent sheet →
          </Link>
        }
      >
        <Await promise={overdue} fallback={<Skeleton />}>
          {(rows) =>
            rows.length === 0 ? (
              <Empty>Nobody is overdue. 🎉</Empty>
            ) : (
              <List>
                {rows.map((t) => (
                  <Row
                    key={t.id}
                    to={t.id}
                    room={t.room}
                    title={t.name}
                    sub={`${t.propertyName} · due on the ${ordinal(t.dueDay)}`}
                  >
                    <Money paise={t.balance} className="font-bold text-pink" />
                  </Row>
                ))}
              </List>
            )
          }
        </Await>
      </Section>

      <div className="grid gap-x-6 md:grid-cols-2">
        <Section title="Agreements ending ≤ 30 days">
          <Await promise={endingSoon} fallback={<Skeleton />}>
            {(rows) =>
              rows.length === 0 ? (
                <Empty>No renewals coming up</Empty>
              ) : (
                <List>
                  {rows.map((t) => (
                    <Row key={t.id} to={t.id} room={t.unitName} title={t.name} sub={t.propertyName}>
                      <Tag tone={t.agreementEnd! < today() ? "bad" : "warn"}>{t.agreementEnd}</Tag>
                    </Row>
                  ))}
                </List>
              )
            }
          </Await>
        </Section>

        <Section title="Recent payments">
          <Await promise={recent} fallback={<Skeleton />}>
            {(rows) =>
              rows.length === 0 ? (
                <Empty>No payments yet</Empty>
              ) : (
                <List>
                  {rows.map((p) => (
                    <Row
                      key={p.id}
                      to={p.tenantId}
                      room={p.unitName}
                      title={p.tenantName}
                      sub={`${p.paidOn} · ${METHOD_LABEL[p.method]}${p.type === "rent" ? "" : p.type === "electricity" ? " · ⚡ electricity, not income" : ` · ${p.type}`}`}
                    >
                      <Money paise={p.amount} className="font-bold" />
                    </Row>
                  ))}
                </List>
              )
            }
          </Await>
        </Section>
      </div>
    </>
  );
}

const List = ({ children }: { children: ReactNode }) => (
  <ul className="divide-y divide-line border border-line bg-surface">{children}</ul>
);

const Row = ({
  to,
  room,
  title,
  sub,
  children,
}: {
  to: string;
  room: string;
  title: string;
  sub: string;
  children: ReactNode;
}) => (
  <li>
    <Link
      to="/tenants/$tenantId"
      params={{ tenantId: to }}
      className="flex items-center gap-3 px-4 py-3 hover:bg-raised"
    >
      <RoomNo room={room} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{title}</div>
        <div className="truncate text-xs text-white/50">{sub}</div>
      </div>
      {children}
    </Link>
  </li>
);

const Skeleton = () => <div className="h-24 animate-pulse border border-line bg-surface" />;
