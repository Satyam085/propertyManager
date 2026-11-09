import "@tanstack/react-start/server-only";
import { and, eq, getTableColumns, isNull, lte, or, gte, sql } from "drizzle-orm";
import { addMonths, chargeMonths, isOverdue, thisMonth, today } from "#/lib/money";
import { charges, db, properties, tenants, units } from "./db.server";

/**
 * Raises rent + maintenance charges for every tenancy, for each month not yet raised up to now.
 * Idempotent (partial unique index + ON CONFLICT DO NOTHING), so loaders call it freely.
 * ponytail: lazy on read; add a Cron Trigger (scheduled() in src/server.ts) if charges must
 * exist without anyone opening the app.
 */
export async function ensureCharges(upTo = thisMonth()) {
  const rows = await db
    .select({
      ...getTableColumns(tenants),
      lastRaised: sql<
        string | null
      >`(select max(month) from charges c where c.tenant_id = "tenants"."id" and c.type = 'rent')`,
    })
    .from(tenants)
    .where(or(isNull(tenants.moveOut), gte(tenants.moveOut, `${addMonths(upTo, -2)}-01`)));

  const inserts = rows.flatMap((t) =>
    chargeMonths(t.moveIn, t.moveOut, upTo)
      .filter((m) => !t.lastRaised || m > t.lastRaised)
      .flatMap((month) =>
        [
          { type: "rent" as const, amount: t.rent },
          { type: "maintenance" as const, amount: t.maintenance },
        ]
          .filter((c) => c.amount > 0)
          .map((c) =>
            db
              .insert(charges)
              .values({ id: crypto.randomUUID(), tenantId: t.id, month, ...c })
              .onConflictDoNothing(),
          ),
      ),
  );
  // one statement per row: D1 caps bound params per statement at 100
  if (inserts.length) await db.batch(inserts as [(typeof inserts)[0], ...typeof inserts]);
}

const sum = (q: ReturnType<typeof sql>) => sql<number>`coalesce((${q}), 0)`;

/**
 * Tenancies with ledger totals. Rent columns cover rent, maintenance and other charges.
 * Electricity is a separate pass-through balance and never counts as income. `month` drives
 * the month-specific columns.
 */
export function tenantsWithBalances(month = thisMonth()) {
  const t = tenants.id;
  return db
    .select({
      ...getTableColumns(tenants),
      unitName: units.name,
      propertyId: units.propertyId,
      propertyName: properties.name,
      charged: sum(
        sql`select sum(amount) from charges c where c.tenant_id = ${t} and c.type != 'electricity'`,
      ),
      paid: sum(
        sql`select sum(amount) from payments p where p.tenant_id = ${t} and p.type = 'rent'`,
      ),
      elecBilled: sum(
        sql`select sum(amount) from charges c where c.tenant_id = ${t} and c.type = 'electricity'`,
      ),
      elecPaid: sum(
        sql`select sum(amount) from payments p where p.tenant_id = ${t} and p.type = 'electricity'`,
      ),
      depositHeld: sum(
        sql`select sum(case p.type when 'deposit' then p.amount when 'refund' then -p.amount else 0 end) from payments p where p.tenant_id = ${t}`,
      ),
      monthCharged: sum(
        sql`select sum(amount) from charges c where c.tenant_id = ${t} and c.month = ${month} and c.type != 'electricity'`,
      ),
      monthPaid: sum(
        sql`select sum(amount) from payments p where p.tenant_id = ${t} and p.type = 'rent' and substr(p.paid_on, 1, 7) = ${month}`,
      ),
      monthElec: sum(
        sql`select sum(amount) from charges c where c.tenant_id = ${t} and c.month = ${month} and c.type = 'electricity'`,
      ),
    })
    .from(tenants)
    .innerJoin(units, eq(units.id, tenants.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .$dynamic();
}

export type TenantRow = Awaited<ReturnType<typeof tenantsWithBalances>>[number];

export const withStatus = (t: TenantRow, now = today()) => {
  const balance = t.charged - t.paid;
  const status =
    balance <= 0
      ? ("paid" as const)
      : isOverdue(balance, t.monthCharged, t.dueDay, now)
        ? ("overdue" as const)
        : ("due" as const);
  return {
    ...t,
    room: t.unitName,
    balance,
    elecDue: t.elecBilled - t.elecPaid,
    status,
  };
};

/** Tenancies active at any point in `month`. */
export const activeIn = (month: string) =>
  and(
    lte(tenants.moveIn, `${month}-31`),
    or(isNull(tenants.moveOut), gte(tenants.moveOut, `${month}-01`)),
  );
