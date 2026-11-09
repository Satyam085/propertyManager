import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { z } from "zod";
import {
  Button,
  ErrorText,
  Field,
  PageHeader,
  Select,
  TextArea,
  errorMessage,
  formValues,
} from "#/components/pop";
import { getPickers } from "#/fns/read.functions";
import {
  CHARGE_TYPES,
  EXPENSE_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_TYPES,
  fmt,
  thisMonth,
  today,
} from "#/lib/money";
import { submit, useOnline, type OutboxKind } from "#/lib/outbox";

const TABS = ["payment", "charge", "reading", "expense"] as const;

// 'data-only': the loader runs on the server (pickers come with the first byte), but the form
// renders on the client. It reads navigator.onLine and the local outbox, which only exist there.
export const Route = createFileRoute("/record")({
  ssr: "data-only",
  validateSearch: z.object({
    tab: z.enum(TABS).default("payment").catch("payment"),
    tenantId: z.string().min(1).max(64).optional().catch(undefined),
  }),
  loader: () => getPickers(),
  head: () => ({ meta: [{ title: "Record · Property Manager" }] }),
  component: RecordPage,
});

type Pick = Awaited<ReturnType<typeof getPickers>>[number];

function RecordPage() {
  const rows = Route.useLoaderData();
  const { tab, tenantId } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const online = useOnline();
  return (
    <>
      <PageHeader
        kicker={online ? "New entry" : "Offline: entries will sync later"}
        title="Record"
      />
      <div className="mb-8 grid grid-cols-4 border border-line" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => navigate({ search: (s) => ({ ...s, tab: t }), replace: true })}
            className="caps py-3 text-white/60 aria-selected:bg-white aria-selected:text-ink"
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "payment" && <PaymentForm rows={rows} tenantId={tenantId} />}
      {tab === "charge" && <ChargeForm rows={rows} tenantId={tenantId} />}
      {tab === "reading" && <ReadingForm rows={rows} />}
      {tab === "expense" && <ExpenseForm rows={rows} />}
    </>
  );
}

/** Shared submit flow: save now or queue offline, then reset and say which happened. */
function EntryForm<K extends OutboxKind>({
  kind,
  build,
  children,
  cta,
}: {
  kind: K;
  build: (v: ReturnType<typeof formValues>) => {
    data: Parameters<typeof submit<K>>[1];
    label: string;
  };
  children: ReactNode;
  cta: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const { data, label } = build(formValues(form));
      const result = await submit(kind, data, label);
      setDone(
        result === "saved"
          ? `Saved: ${label}`
          : `Saved offline: ${label}. It will sync when you're back online.`,
      );
      form.reset();
      if (result === "saved") void router.invalidate();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-6">
      {children}
      <div>
        <Button tone="mint" size="lg" disabled={busy}>
          {busy ? "Saving…" : cta}
        </Button>
      </div>
      <ErrorText error={error} />
      {done && (
        <p role="status" className="border-l-2 border-mint pl-2 text-sm text-mint">
          {done}
        </p>
      )}
    </form>
  );
}

const tenantsOf = (rows: Pick[]) => rows.filter((r) => r.tenantId);

function TenantSelect({ rows, tenantId }: { rows: Pick[]; tenantId?: string }) {
  return (
    <Select label="Tenant" name="tenantId" required defaultValue={tenantId ?? ""}>
      <option value="" disabled>
        Choose a tenant
      </option>
      {tenantsOf(rows).map((r) => (
        <option key={r.tenantId} value={r.tenantId!}>
          {r.tenantName} · {r.propertyName} {r.unitName}
        </option>
      ))}
    </Select>
  );
}

function PaymentForm({ rows, tenantId }: { rows: Pick[]; tenantId?: string }) {
  const name = (id: string) =>
    tenantsOf(rows).find((r) => r.tenantId === id)?.tenantName ?? "tenant";
  return (
    <EntryForm
      kind="recordPayment"
      cta="Save payment"
      build={(v) => {
        const data = {
          id: crypto.randomUUID(),
          tenantId: v.str("tenantId"),
          paidOn: v.str("paidOn"),
          amount: v.paise("amount"),
          type: v.str("type") as (typeof PAYMENT_TYPES)[number],
          method: v.str("method") as (typeof PAYMENT_METHODS)[number],
          note: v.str("note"),
        };
        return { data, label: `${fmt(data.amount)} from ${name(data.tenantId)}` };
      }}
    >
      <TenantSelect rows={rows} tenantId={tenantId} />
      <Field
        label="Amount (₹)"
        name="amount"
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        required
        big
      />
      <div className="grid grid-cols-2 gap-6">
        <Field label="Paid on" name="paidOn" type="date" defaultValue={today()} required />
        <Select label="Method" name="method" defaultValue="upi">
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {m.toUpperCase()}
            </option>
          ))}
        </Select>
      </div>
      <Select label="For" name="type" defaultValue="rent">
        <option value="rent">Rent / bills</option>
        <option value="deposit">Security deposit received</option>
        <option value="refund">Deposit refunded to tenant</option>
      </Select>
      <Field label="Note" name="note" placeholder="Optional, e.g. UPI ref" maxLength={300} />
    </EntryForm>
  );
}

function ChargeForm({ rows, tenantId }: { rows: Pick[]; tenantId?: string }) {
  return (
    <EntryForm
      kind="addCharge"
      cta="Add charge"
      build={(v) => {
        const data = {
          id: crypto.randomUUID(),
          tenantId: v.str("tenantId"),
          month: v.str("month"),
          type: v.str("type") as (typeof CHARGE_TYPES)[number],
          amount: v.paise("amount"),
          note: v.str("note"),
        };
        return { data, label: `${data.type} charge ${fmt(data.amount)}` };
      }}
    >
      <TenantSelect rows={rows} tenantId={tenantId} />
      <div className="grid grid-cols-2 gap-6">
        <Select label="Type" name="type" defaultValue="electricity">
          {CHARGE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Field label="Month" name="month" type="month" defaultValue={thisMonth()} required />
      </div>
      <Field
        label="Amount (₹), negative for a discount"
        name="amount"
        type="number"
        inputMode="decimal"
        step="0.01"
        required
        big
      />
      <Field
        label="Note"
        name="note"
        placeholder="e.g. Oct electricity bill share"
        maxLength={300}
      />
      <p className="-mt-2 text-xs text-white/40">
        Rent and maintenance are added automatically each month. Use this for bills, repairs passed
        on, or a prorated first month (negative amount).
      </p>
    </EntryForm>
  );
}

function ReadingForm({ rows }: { rows: Pick[] }) {
  const units = rows.filter((r) => r.unitId);
  const [unitId, setUnitId] = useState("");
  const unit = units.find((u) => u.unitId === unitId);
  return (
    <EntryForm
      kind="addReading"
      cta="Save reading"
      build={(v) => {
        const data = {
          id: crypto.randomUUID(),
          unitId: v.str("unitId"),
          readOn: v.str("readOn"),
          value: v.int("value"),
        };
        return { data, label: `meter ${data.value} kWh` };
      }}
    >
      <Select
        label="Unit"
        name="unitId"
        required
        value={unitId}
        onChange={(e) => setUnitId(e.currentTarget.value)}
      >
        <option value="" disabled>
          Choose a unit
        </option>
        {units.map((u) => (
          <option key={u.unitId} value={u.unitId!}>
            {u.propertyName} · {u.unitName}
            {u.tenantName ? ` (${u.tenantName})` : " (vacant)"}
          </option>
        ))}
      </Select>
      <Field
        label="Meter reading (kWh)"
        name="value"
        type="number"
        inputMode="numeric"
        min={unit?.lastReading ?? 0}
        step="1"
        required
        big
      />
      <p className="-mt-3 text-xs text-white/50">
        {unit
          ? unit.lastReading == null
            ? "First reading for this unit: it is the baseline, no charge."
            : `Last reading ${unit.lastReading}. The difference × the tenant's rate becomes an electricity charge.`
          : "Pick a unit to see its last reading."}
      </p>
      <Field label="Read on" name="readOn" type="date" defaultValue={today()} required />
    </EntryForm>
  );
}

function ExpenseForm({ rows }: { rows: Pick[] }) {
  const props = [...new Map(rows.map((r) => [r.propertyId, r.propertyName])).entries()];
  const [propertyId, setPropertyId] = useState("");
  return (
    <EntryForm
      kind="addExpense"
      cta="Save expense"
      build={(v) => {
        const data = {
          id: crypto.randomUUID(),
          propertyId: v.str("propertyId"),
          unitId: v.opt("unitId"),
          spentOn: v.str("spentOn"),
          category: v.str("category") as (typeof EXPENSE_CATEGORIES)[number],
          amount: v.paise("amount"),
          note: v.str("note"),
        };
        return { data, label: `${data.category} ${fmt(data.amount)}` };
      }}
    >
      <Select
        label="Property"
        name="propertyId"
        required
        value={propertyId}
        onChange={(e) => setPropertyId(e.currentTarget.value)}
      >
        <option value="" disabled>
          Choose a property
        </option>
        {props.map(([id, name]) => (
          <option key={id} value={id}>
            {name}
          </option>
        ))}
      </Select>
      <div className="grid grid-cols-2 gap-6">
        <Select label="Unit" name="unitId" defaultValue="">
          <option value="">Whole property</option>
          {rows
            .filter((r) => r.propertyId === propertyId && r.unitId)
            .map((r) => (
              <option key={r.unitId} value={r.unitId!}>
                {r.unitName}
              </option>
            ))}
        </Select>
        <Select label="Category" name="category" defaultValue="maintenance">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </div>
      <Field
        label="Amount (₹)"
        name="amount"
        type="number"
        inputMode="decimal"
        min="0.01"
        step="0.01"
        required
        big
      />
      <Field label="Spent on" name="spentOn" type="date" defaultValue={today()} required />
      <TextArea label="Note" name="note" maxLength={300} placeholder="What was it for?" />
    </EntryForm>
  );
}
