// POST server functions. Zod validators are the trust boundary. Entries that can be queued
// offline (payment, charge, expense, reading) take a client-generated id so a replay is a no-op.
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  CHARGE_TYPES,
  ELECTRICITY_METHODS,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_TYPES,
} from "#/lib/money";
import { charges, db, expenses, payments, properties, tenants, units } from "#/server/db.server";
import { removeFile, storeFile } from "#/server/files.server";

const zId = z.string().min(1).max(64);
const zUuid = z.uuid();
const zDate = z.iso.date();
const zText = (max = 200) => z.string().trim().max(max);
const zPaise = z.number().int().min(0).max(1e11);
const zMonth = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

const ok = { ok: true } as const;

// ---------- properties & units ----------

export const saveProperty = createServerFn({ method: "POST" })
  .validator(z.object({ id: zId.optional(), name: zText(100).min(1), address: zText(300) }))
  .handler(async ({ data }) => {
    if (data.id) {
      await db.update(properties).set(data).where(eq(properties.id, data.id));
      return { id: data.id };
    }
    const id = crypto.randomUUID();
    await db.insert(properties).values({ ...data, id });
    return { id };
  });

export const deleteProperty = createServerFn({ method: "POST" })
  .validator(z.object({ id: zId }))
  .handler(async ({ data }) => {
    try {
      await db.delete(properties).where(eq(properties.id, data.id));
    } catch {
      // FK from tenants → units blocks this; the DB is the guard
      throw new Error("This property has tenancy history, so it can't be deleted");
    }
    return ok;
  });

export const saveUnit = createServerFn({ method: "POST" })
  .validator(
    z.object({ id: zId.optional(), propertyId: zId, name: zText(60).min(1), rent: zPaise }),
  )
  .handler(async ({ data }) => {
    try {
      if (data.id) await db.update(units).set(data).where(eq(units.id, data.id));
      else await db.insert(units).values({ ...data, id: crypto.randomUUID() });
    } catch {
      throw new Error(`Room "${data.name}" already exists in this property`);
    }
    return ok;
  });

export const deleteUnit = createServerFn({ method: "POST" })
  .validator(z.object({ id: zId }))
  .handler(async ({ data }) => {
    try {
      await db.delete(units).where(eq(units.id, data.id));
    } catch {
      throw new Error("This room has tenancy history and can't be deleted");
    }
    return ok;
  });

// ---------- tenants ----------

const tenantFields = z.object({
  unitId: zId,
  name: zText(100).min(1),
  phone: zText(20),
  email: zText(100),
  moveIn: zDate,
  agreementEnd: zDate.nullable(),
  rent: zPaise.min(1),
  deposit: zPaise,
  maintenance: zPaise,
  label: zText(10),
  dueDay: z.number().int().min(1).max(28),
  notes: zText(2000),
});

// the DB enforces one active tenant per (room, suffix)
const SUFFIX_TAKEN =
  "Another active tenant in this room already uses that suffix. Give each one its own (A, B…)";

export const createTenant = createServerFn({ method: "POST" })
  .validator(tenantFields)
  .handler(async ({ data }) => {
    const id = crypto.randomUUID();
    try {
      await db.insert(tenants).values({ ...data, id });
    } catch {
      throw new Error(SUFFIX_TAKEN);
    }
    return { id };
  });

export const updateTenant = createServerFn({ method: "POST" })
  .validator(tenantFields.omit({ unitId: true, moveIn: true }).extend({ id: zId }))
  .handler(async ({ data }) => {
    const { id, ...rest } = data;
    // ponytail: rent changes apply to months raised from now on; past charges stay as billed
    try {
      await db.update(tenants).set(rest).where(eq(tenants.id, id));
    } catch {
      throw new Error(SUFFIX_TAKEN);
    }
    return ok;
  });

export const moveOut = createServerFn({ method: "POST" })
  .validator(z.object({ id: zId, moveOut: zDate.nullable() }))
  .handler(async ({ data }) => {
    try {
      await db.update(tenants).set({ moveOut: data.moveOut }).where(eq(tenants.id, data.id));
    } catch {
      throw new Error(SUFFIX_TAKEN);
    }
    return ok;
  });

// ---------- money entries (offline-queueable) ----------

export const recordPayment = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        id: zUuid,
        tenantId: zId,
        paidOn: zDate,
        amount: zPaise.min(1),
        type: z.enum(PAYMENT_TYPES),
        method: z.enum(PAYMENT_METHODS),
        note: zText(300),
      })
      .refine(
        (p) =>
          p.type === "electricity"
            ? (ELECTRICITY_METHODS as readonly string[]).includes(p.method)
            : p.method !== "utility",
        {
          message: "Electricity is paid to the utility directly, or to you in cash or UPI",
          path: ["method"],
        },
      ),
  )
  .handler(async ({ data }) => {
    await db.insert(payments).values(data).onConflictDoNothing({ target: payments.id });
    return ok;
  });

export const addCharge = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: zUuid,
      tenantId: zId,
      month: zMonth,
      type: z.enum(CHARGE_TYPES),
      amount: z
        .number()
        .int()
        .min(-1e11)
        .max(1e11)
        .refine((n) => n !== 0, "Amount can't be zero"),
      note: zText(300),
    }),
  )
  .handler(async ({ data }) => {
    try {
      await db.insert(charges).values(data).onConflictDoNothing({ target: charges.id });
    } catch {
      throw new Error(`A ${data.type} charge for ${data.month} already exists`);
    }
    return ok;
  });

export const addExpense = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: zUuid,
      propertyId: zId,
      unitId: zId.nullable(),
      spentOn: zDate,
      category: z.enum(EXPENSE_CATEGORIES),
      amount: zPaise.min(1),
      note: zText(300),
    }),
  )
  .handler(async ({ data }) => {
    await db.insert(expenses).values(data).onConflictDoNothing({ target: expenses.id });
    return ok;
  });

/**
 * Electricity bill for a tenant, entered by hand when it arrives. Pass-through money: tracked as
 * its own balance, never as income. `payment` settles it right away (paid to the utility
 * directly, or collected by you).
 */
export const addElectricityBill = createServerFn({ method: "POST" })
  .validator(
    z.object({
      id: zUuid,
      tenantId: zId,
      month: zMonth,
      amount: zPaise.min(1),
      note: zText(300),
      payment: z
        .object({ id: zUuid, paidOn: zDate, method: z.enum(ELECTRICITY_METHODS) })
        .nullable(),
    }),
  )
  .handler(async ({ data }) => {
    const { payment, ...bill } = data;
    const insertBill = db
      .insert(charges)
      .values({ ...bill, type: "electricity" })
      .onConflictDoNothing({ target: charges.id });
    if (!payment) {
      await insertBill;
      return ok;
    }
    await db.batch([
      insertBill,
      db
        .insert(payments)
        .values({ ...payment, tenantId: bill.tenantId, amount: bill.amount, type: "electricity" })
        .onConflictDoNothing({ target: payments.id }),
    ]);
    return ok;
  });

const deletable = { payment: payments, charge: charges, expense: expenses } as const;

export const deleteEntry = createServerFn({ method: "POST" })
  .validator(z.object({ kind: z.enum(["payment", "charge", "expense"]), id: zId }))
  .handler(async ({ data }) => {
    const table = deletable[data.kind];
    await db.delete(table).where(eq(table.id, data.id));
    return ok;
  });

// ---------- files ----------

export const uploadFile = createServerFn({ method: "POST" })
  .validator((d: unknown) => {
    if (!(d instanceof FormData)) throw new Error("Expected form data");
    return d;
  })
  .handler(({ data }) => storeFile(data));

export const deleteFile = createServerFn({ method: "POST" })
  .validator(z.object({ id: zId }))
  .handler(async ({ data }) => {
    await removeFile(data.id);
    return ok;
  });
