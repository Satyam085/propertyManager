// GET server functions: the only data-read API the UI uses. GET keeps them cacheable by the
// service worker for offline reads. Handlers (and their *.server imports) never reach the client.
import { createServerFn } from "@tanstack/react-start";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  like,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { z } from "zod";
import { addMonths, EXPENSE_CATEGORIES, thisMonth, today } from "#/lib/money";
import {
  charges,
  db,
  expenses,
  files,
  payments,
  properties,
  tenants,
  units,
} from "#/server/db.server";
import { activeIn, ensureCharges, tenantsWithBalances, withStatus } from "#/server/ledger.server";

// Drizzle leaves columns unqualified when a select has no joins, which would bind a correlated
// subquery to the inner table's "id". Spell the outer column out.
const PROPERTY_ID = sql.raw(`"properties"."id"`);

export const zMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const zId = z.string().min(1).max(64);

// ---------- dashboard (KPIs awaited, the rest streamed) ----------

export const getKpis = createServerFn({ method: "GET" }).handler(async () => {
  await ensureCharges();
  const month = thisMonth();
  const [[expected], [collected], [spent], [unitCount], rows] = await Promise.all([
    db
      .select({ v: sql<number>`coalesce(sum(amount),0)` })
      .from(charges)
      .where(and(eq(charges.month, month), ne(charges.type, "electricity"))),
    db
      .select({ v: sql<number>`coalesce(sum(amount),0)` })
      .from(payments)
      .where(and(eq(payments.type, "rent"), like(payments.paidOn, `${month}-%`))),
    db
      .select({ v: sql<number>`coalesce(sum(amount),0)` })
      .from(expenses)
      .where(like(expenses.spentOn, `${month}-%`)),
    db.select({ v: count() }).from(units),
    tenantsWithBalances(month).where(isNull(tenants.moveOut)),
  ]);
  const outstanding = rows.reduce((s, t) => s + Math.max(0, t.charged - t.paid), 0);
  const elecDue = rows.reduce((s, t) => s + Math.max(0, t.elecBilled - t.elecPaid), 0);
  return {
    month,
    expected: expected.v,
    collected: collected.v,
    expenses: spent.v,
    net: collected.v - spent.v,
    outstanding,
    elecDue,
    tenants: rows.length,
    occupied: new Set(rows.map((t) => t.unitId)).size,
    units: unitCount.v,
  };
});

export const getOverdue = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await tenantsWithBalances().where(isNull(tenants.moveOut));
  return rows
    .map((t) => withStatus(t))
    .filter((t) => t.status === "overdue")
    .sort((a, b) => b.balance - a.balance);
});

export const getEndingSoon = createServerFn({ method: "GET" }).handler(async () => {
  const soon = new Date(Date.now() + 30 * 864e5);
  return db
    .select({
      id: tenants.id,
      name: tenants.name,
      agreementEnd: tenants.agreementEnd,
      unitName: units.name,
      propertyName: properties.name,
    })
    .from(tenants)
    .innerJoin(units, eq(units.id, tenants.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .where(
      and(
        isNull(tenants.moveOut),
        isNotNull(tenants.agreementEnd),
        lte(tenants.agreementEnd, today(soon)),
      ),
    )
    .orderBy(asc(tenants.agreementEnd));
});

export const getRecentPayments = createServerFn({ method: "GET" }).handler(() =>
  db
    .select({
      id: payments.id,
      paidOn: payments.paidOn,
      amount: payments.amount,
      type: payments.type,
      method: payments.method,
      tenantId: tenants.id,
      tenantName: tenants.name,
      unitName: units.name,
      propertyName: properties.name,
    })
    .from(payments)
    .innerJoin(tenants, eq(tenants.id, payments.tenantId))
    .innerJoin(units, eq(units.id, tenants.unitId))
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .orderBy(desc(payments.paidOn), desc(payments.createdAt))
    .limit(8),
);

// ---------- properties ----------

export const listProperties = createServerFn({ method: "GET" }).handler(() =>
  db
    .select({
      id: properties.id,
      name: properties.name,
      address: properties.address,
      units: sql<number>`(select count(*) from units u where u.property_id = ${PROPERTY_ID})`,
      occupied: sql<number>`(select count(distinct t.unit_id) from tenants t join units u on u.id = t.unit_id where u.property_id = ${PROPERTY_ID} and t.move_out is null)`,
      rent: sql<number>`coalesce((select sum(t.rent) from tenants t join units u on u.id = t.unit_id where u.property_id = ${PROPERTY_ID} and t.move_out is null), 0)`,
    })
    .from(properties)
    .orderBy(asc(properties.name)),
);

export const getProperty = createServerFn({ method: "GET" })
  .validator(z.object({ id: zId }))
  .handler(async ({ data }) => {
    const [property] = await db.select().from(properties).where(eq(properties.id, data.id));
    if (!property) throw new Error("Property not found");
    const month = thisMonth();
    const [unitRows, active, recentExpenses, photos] = await Promise.all([
      db.select().from(units).where(eq(units.propertyId, data.id)).orderBy(asc(units.name)),
      tenantsWithBalances().where(and(eq(units.propertyId, data.id), isNull(tenants.moveOut))),
      db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.propertyId, data.id),
            gte(expenses.spentOn, `${addMonths(month, -5)}-01`),
          ),
        )
        .orderBy(desc(expenses.spentOn))
        .limit(20),
      db
        .select()
        .from(files)
        .where(and(eq(files.ownerType, "property"), eq(files.ownerId, data.id)))
        .orderBy(desc(files.createdAt)),
    ]);
    const withState = active.map((t) => withStatus(t));
    return {
      property,
      units: unitRows.map((u) => ({
        ...u,
        tenants: withState
          .filter((t) => t.unitId === u.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      })),
      expenses: recentExpenses,
      photos,
    };
  });

// ---------- tenants ----------

export const listTenants = createServerFn({ method: "GET" })
  .validator(z.object({ status: z.enum(["active", "past"]), q: z.string().max(100).optional() }))
  .handler(async ({ data }) => {
    await ensureCharges();
    const rows = await tenantsWithBalances()
      .where(
        and(
          data.status === "active" ? isNull(tenants.moveOut) : isNotNull(tenants.moveOut),
          data.q
            ? or(like(tenants.name, `%${data.q}%`), like(tenants.phone, `%${data.q}%`))
            : undefined,
        ),
      )
      .orderBy(asc(properties.name), asc(units.name), asc(tenants.name));
    return rows.map((t) => withStatus(t));
  });

export const getTenant = createServerFn({ method: "GET" })
  .validator(z.object({ id: zId }))
  .handler(async ({ data }) => {
    await ensureCharges();
    const [row] = await tenantsWithBalances().where(eq(tenants.id, data.id));
    if (!row) throw new Error("Tenant not found");
    const [chargeRows, paymentRows, docs] = await Promise.all([
      db
        .select()
        .from(charges)
        .where(eq(charges.tenantId, data.id))
        .orderBy(desc(charges.month), desc(charges.createdAt)),
      db
        .select()
        .from(payments)
        .where(eq(payments.tenantId, data.id))
        .orderBy(desc(payments.paidOn), desc(payments.createdAt)),
      db
        .select()
        .from(files)
        .where(and(eq(files.ownerType, "tenant"), eq(files.ownerId, data.id)))
        .orderBy(desc(files.createdAt)),
    ]);
    return { tenant: withStatus(row), charges: chargeRows, payments: paymentRows, docs };
  });

/** Everything the entry forms need to pick from: properties > units > active tenant. */
export const getPickers = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await db
    .select({
      propertyId: properties.id,
      propertyName: properties.name,
      unitId: units.id,
      unitName: units.name,
      unitRent: units.rent,
      tenantId: tenants.id,
      tenantName: tenants.name,
      tenantRent: tenants.rent,
    })
    .from(properties)
    .leftJoin(units, eq(units.propertyId, properties.id))
    .leftJoin(tenants, and(eq(tenants.unitId, units.id), isNull(tenants.moveOut)))
    .orderBy(asc(properties.name), asc(units.name), asc(tenants.name));
  return rows;
});

// ---------- rent sheet, expenses, reports ----------

export const rentSearch = z.object({
  month: zMonth,
  propertyId: zId.optional(),
  status: z.enum(["all", "due", "paid"]),
});

export const getRentSheet = createServerFn({ method: "GET" })
  .validator(rentSearch)
  .handler(async ({ data }) => {
    await ensureCharges();
    const rows = await tenantsWithBalances(data.month)
      .where(
        and(
          activeIn(data.month),
          data.propertyId ? eq(units.propertyId, data.propertyId) : undefined,
        ),
      )
      .orderBy(asc(properties.name), asc(units.name), asc(tenants.name));
    const all = rows.map((t) => withStatus(t));
    const shown = all.filter((t) =>
      data.status === "all" ? true : data.status === "paid" ? t.balance <= 0 : t.balance > 0,
    );
    return {
      rows: shown,
      totals: {
        charged: all.reduce((s, t) => s + t.monthCharged, 0),
        paid: all.reduce((s, t) => s + t.monthPaid, 0),
        outstanding: all.reduce((s, t) => s + Math.max(0, t.balance), 0),
        // pass-through, shown separately and never added to income
        elecBilled: all.reduce((s, t) => s + t.monthElec, 0),
        elecDue: all.reduce((s, t) => s + Math.max(0, t.elecDue), 0),
      },
    };
  });

export const expenseSearch = z.object({
  month: zMonth,
  propertyId: zId.optional(),
  category: z.enum(EXPENSE_CATEGORIES).optional(),
});

export const listExpenses = createServerFn({ method: "GET" })
  .validator(expenseSearch)
  .handler(async ({ data }) => {
    const rows = await db
      .select({
        id: expenses.id,
        spentOn: expenses.spentOn,
        category: expenses.category,
        amount: expenses.amount,
        note: expenses.note,
        propertyId: expenses.propertyId,
        propertyName: properties.name,
        unitName: units.name,
      })
      .from(expenses)
      .innerJoin(properties, eq(properties.id, expenses.propertyId))
      .leftJoin(units, eq(units.id, expenses.unitId))
      .where(
        and(
          like(expenses.spentOn, `${data.month}-%`),
          data.propertyId ? eq(expenses.propertyId, data.propertyId) : undefined,
          data.category ? eq(expenses.category, data.category) : undefined,
        ),
      )
      .orderBy(desc(expenses.spentOn), desc(expenses.createdAt));
    return { rows, total: rows.reduce((s, r) => s + r.amount, 0) };
  });

const zYear = z.object({ year: z.number().int().min(2000).max(2100) });

export const getYearSummary = createServerFn({ method: "GET" })
  .validator(zYear)
  .handler(async ({ data }) => {
    const y = String(data.year);
    const [income, spend] = await Promise.all([
      db
        .select({
          month: sql<string>`substr(${payments.paidOn}, 1, 7)`,
          v: sql<number>`sum(${payments.amount})`,
        })
        .from(payments)
        .where(and(eq(payments.type, "rent"), like(payments.paidOn, `${y}-%`)))
        .groupBy(sql`1`),
      db
        .select({
          month: sql<string>`substr(${expenses.spentOn}, 1, 7)`,
          v: sql<number>`sum(${expenses.amount})`,
        })
        .from(expenses)
        .where(like(expenses.spentOn, `${y}-%`))
        .groupBy(sql`1`),
    ]);
    const inc = new Map(income.map((r) => [r.month, r.v]));
    const exp = new Map(spend.map((r) => [r.month, r.v]));
    return Array.from({ length: 12 }, (_, i) => {
      const month = `${y}-${String(i + 1).padStart(2, "0")}`;
      return { month, income: inc.get(month) ?? 0, expenses: exp.get(month) ?? 0 };
    });
  });

export const getPropertyBreakdown = createServerFn({ method: "GET" })
  .validator(zYear)
  .handler(({ data }) => {
    const y = `${data.year}-%`;
    return db
      .select({
        id: properties.id,
        name: properties.name,
        income: sql<number>`coalesce((select sum(p.amount) from payments p join tenants t on t.id = p.tenant_id join units u on u.id = t.unit_id where u.property_id = ${PROPERTY_ID} and p.type = 'rent' and p.paid_on like ${y}), 0)`,
        expenses: sql<number>`coalesce((select sum(e.amount) from expenses e where e.property_id = ${PROPERTY_ID} and e.spent_on like ${y}), 0)`,
      })
      .from(properties)
      .orderBy(asc(properties.name));
  });

/** Rooms for the new-tenant picker, with how many active tenants each already has. */
export const getRooms = createServerFn({ method: "GET" }).handler(() =>
  db
    .select({
      id: units.id,
      name: units.name,
      rent: units.rent,
      propertyName: properties.name,
      active: sql<number>`(select count(*) from tenants t where t.unit_id = ${units.id} and t.move_out is null)`,
    })
    .from(units)
    .innerJoin(properties, eq(properties.id, units.propertyId))
    .orderBy(asc(properties.name), asc(units.name)),
);
