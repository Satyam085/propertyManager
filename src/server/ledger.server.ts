import "@tanstack/react-start/server-only";
import { and, desc, eq, getTableColumns, isNull, lte, or, gte, sql } from "drizzle-orm";
import {
  addMonths,
  chargeMonths,
  electricityAmount,
  isOverdue,
  monthOf,
  thisMonth,
  today,
} from "#/lib/money";
import { charges, db, properties, readings, tenants, units } from "./db.server";

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

/** Tenancies with ledger totals. `month` drives the month-specific columns. */
export function tenantsWithBalances(month = thisMonth()) {
  return db
    .select({
      ...getTableColumns(tenants),
      unitName: units.name,
      propertyId: units.propertyId,
      propertyName: properties.name,
      charged: sum(sql`select sum(amount) from charges c where c.tenant_id = ${tenants.id}`),
      paid: sum(
        sql`select sum(amount) from payments p where p.tenant_id = ${tenants.id} and p.type = 'rent'`,
      ),
      depositHeld: sum(
        sql`select sum(case p.type when 'deposit' then p.amount when 'refund' then -p.amount else 0 end) from payments p where p.tenant_id = ${tenants.id}`,
      ),
      monthCharged: sum(
        sql`select sum(amount) from charges c where c.tenant_id = ${tenants.id} and c.month = ${month}`,
      ),
      monthPaid: sum(
        sql`select sum(amount) from payments p where p.tenant_id = ${tenants.id} and p.type = 'rent' and substr(p.paid_on, 1, 7) = ${month}`,
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
  return { ...t, balance, status };
};

/** Tenancies active at any point in `month`. */
export const activeIn = (month: string) =>
  and(
    lte(tenants.moveIn, `${month}-31`),
    or(isNull(tenants.moveOut), gte(tenants.moveOut, `${month}-01`)),
  );

/**
 * Saves a meter reading and, if the unit has an active tenant with a rate, the electricity charge
 * for the units consumed since the previous reading. Idempotent on the client-generated id.
 */
export async function saveReading(r: {
  id: string;
  unitId: string;
  readOn: string;
  value: number;
}) {
  const existing = await db.select({ id: readings.id }).from(readings).where(eq(readings.id, r.id));
  if (existing.length) return { duplicate: true };

  const [prev] = await db
    .select()
    .from(readings)
    .where(and(eq(readings.unitId, r.unitId), lte(readings.readOn, r.readOn)))
    .orderBy(desc(readings.readOn), desc(readings.createdAt))
    .limit(1);
  if (prev && r.value < prev.value) {
    throw new Error(`Reading ${r.value} is lower than the previous ${prev.value} (${prev.readOn})`);
  }

  const [tenant] = await db
    .select()
    .from(tenants)
    .where(
      and(
        eq(tenants.unitId, r.unitId),
        lte(tenants.moveIn, r.readOn),
        or(isNull(tenants.moveOut), gte(tenants.moveOut, r.readOn)),
      ),
    )
    .limit(1);

  const used = prev ? r.value - prev.value : 0;
  const chargeId = prev && tenant && tenant.elecRate > 0 && used > 0 ? crypto.randomUUID() : null;
  const stmts = [db.insert(readings).values({ ...r, chargeId })] as const;
  if (chargeId && prev && tenant) {
    await db.batch([
      ...stmts,
      db.insert(charges).values({
        id: chargeId,
        tenantId: tenant.id,
        month: monthOf(r.readOn),
        type: "electricity",
        amount: electricityAmount(prev.value, r.value, tenant.elecRate),
        note: `${prev.value} → ${r.value} (${used} kWh)`,
      }),
    ]);
  } else {
    await db.batch(stmts);
  }
  return { duplicate: false, used, charged: !!chargeId };
}
