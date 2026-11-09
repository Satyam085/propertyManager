// No server-only marker here: drizzle-kit loads this file in Node. Import protection still blocks it
// from the client bundle via the `*.server.*` name; client code may only `import type` from it.
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import {
  CHARGE_TYPES,
  EXPENSE_CATEGORIES,
  FILE_OWNERS,
  PAYMENT_METHODS,
  PAYMENT_TYPES,
} from "../lib/money";

// Money is integer paise. Dates are 'YYYY-MM-DD' text, months 'YYYY-MM'.
const id = () => text("id").primaryKey();
const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`);

export const properties = sqliteTable("properties", {
  id: id(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  createdAt: createdAt(),
});

export const units = sqliteTable(
  "units",
  {
    id: id(),
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    rent: integer("rent").notNull().default(0),
  },
  (t) => [uniqueIndex("units_property_name").on(t.propertyId, t.name)],
);

// One row per tenancy. Re-renting to the same person = a new row.
export const tenants = sqliteTable(
  "tenants",
  {
    id: id(),
    unitId: text("unit_id")
      .notNull()
      .references(() => units.id),
    name: text("name").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    moveIn: text("move_in").notNull(),
    moveOut: text("move_out"),
    agreementEnd: text("agreement_end"),
    rent: integer("rent").notNull(),
    deposit: integer("deposit").notNull().default(0),
    maintenance: integer("maintenance").notNull().default(0),
    dueDay: integer("due_day").notNull().default(5),
    // suffix inside the room: room "2325" + label "A" = "2325 A". Empty = the whole room.
    label: text("label").notNull().default(""),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    // a room can hold several active tenants, but each needs its own suffix
    uniqueIndex("tenants_active_room_label")
      .on(t.unitId, t.label)
      .where(sql`${t.moveOut} IS NULL`),
    check("tenants_due_day", sql`${t.dueDay} BETWEEN 1 AND 28`),
  ],
);

export const charges = sqliteTable(
  "charges",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    type: text("type", { enum: CHARGE_TYPES }).notNull(),
    amount: integer("amount").notNull(), // may be negative for discounts/proration
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("charges_tenant").on(t.tenantId),
    index("charges_month").on(t.month),
    // recurring charges are raised at most once per tenant per month
    uniqueIndex("charges_recurring_once")
      .on(t.tenantId, t.month, t.type)
      .where(sql`${t.type} IN ('rent','maintenance')`),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: id(),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    paidOn: text("paid_on").notNull(),
    amount: integer("amount").notNull(),
    type: text("type", { enum: PAYMENT_TYPES }).notNull().default("rent"),
    method: text("method", { enum: PAYMENT_METHODS }).notNull().default("upi"),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("payments_tenant").on(t.tenantId),
    index("payments_paid_on").on(t.paidOn),
    check("payments_positive", sql`${t.amount} > 0`),
  ],
);

export const expenses = sqliteTable(
  "expenses",
  {
    id: id(),
    propertyId: text("property_id")
      .notNull()
      .references(() => properties.id, { onDelete: "cascade" }),
    unitId: text("unit_id"),
    spentOn: text("spent_on").notNull(),
    category: text("category", { enum: EXPENSE_CATEGORIES }).notNull(),
    amount: integer("amount").notNull(),
    note: text("note").notNull().default(""),
    createdAt: createdAt(),
  },
  (t) => [
    index("expenses_property").on(t.propertyId, t.spentOn),
    check("expenses_positive", sql`${t.amount} > 0`),
  ],
);

export const files = sqliteTable(
  "files",
  {
    id: id(),
    ownerType: text("owner_type", { enum: FILE_OWNERS }).notNull(),
    ownerId: text("owner_id").notNull(),
    key: text("key").notNull().unique(),
    name: text("name").notNull(),
    contentType: text("content_type").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("files_owner").on(t.ownerType, t.ownerId)],
);

export type Property = typeof properties.$inferSelect;
export type Unit = typeof units.$inferSelect;
export type Tenant = typeof tenants.$inferSelect;
export type Charge = typeof charges.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type FileRow = typeof files.$inferSelect;
