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
  ELECTRICITY_METHODS,
  EXPENSE_CATEGORIES,
  METHOD_LABEL,
  PAYMENT_METHODS,
  PAYMENT_TYPES,
  cap,
  fmt,
  monthLabel,
  thisMonth,
  today,
} from "#/lib/money";
import { submit, useOnline, type OutboxKind } from "#/lib/outbox";

const TABS = ["payment", "electricity", "charge", "expense"] as const;

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
type Method = (typeof PAYMENT_METHODS)[number];

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
      <div className="mb-8 grid grid-cols-2 border border-line sm:grid-cols-4" role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => navigate({ search: (s) => ({ ...s, tab: t }), replace: true })}
            className="caps py-3 text-white/60 aria-selected:bg-white aria-selected:text-ink"
          >
            {t === "electricity" ? "⚡ Electricity" : t}
          </button>
        ))}
      </div>
      {tab === "payment" && <PaymentForm rows={rows} tenantId={tenantId} />}
      {tab === "electricity" && <ElectricityForm rows={rows} tenantId={tenantId} />}
      {tab === "charge" && <ChargeForm rows={rows} tenantId={tenantId} />}
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
const tenantName = (rows: Pick[], id: string) =>
  tenantsOf(rows).find((r) => r.tenantId === id)?.tenantName ?? "tenant";

function TenantSelect({ rows, tenantId }: { rows: Pick[]; tenantId?: string }) {
  return (
    <Select label="Tenant" name="tenantId" required defaultValue={tenantId ?? ""}>
      <option value="" disabled>
        Choose a tenant
      </option>
      {tenantsOf(rows).map((r) => (
        <option key={r.tenantId} value={r.tenantId!}>
          {r.unitName} · {r.tenantName} · {r.propertyName}
        </option>
      ))}
    </Select>
  );
}

const PAYMENT_FOR: Record<(typeof PAYMENT_TYPES)[number], string> = {
  rent: "Rent / maintenance / other charges",
  electricity: "Electricity bill (not income)",
  deposit: "Security deposit received",
  refund: "Deposit refunded to tenant",
};

function PaymentForm({ rows, tenantId }: { rows: Pick[]; tenantId?: string }) {
  const [type, setType] = useState<(typeof PAYMENT_TYPES)[number]>("rent");
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
          type,
          method: v.str("method") as Method,
          note: v.str("note"),
        };
        return { data, label: `${fmt(data.amount)} from ${tenantName(rows, data.tenantId)}` };
      }}
    >
      <TenantSelect rows={rows} tenantId={tenantId} />
      <Select
        label="For"
        name="type"
        value={type}
        onChange={(e) => setType(e.currentTarget.value as typeof type)}
      >
        {PAYMENT_TYPES.map((t) => (
          <option key={t} value={t}>
            {PAYMENT_FOR[t]}
          </option>
        ))}
      </Select>
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
        <Select
          label="Method"
          name="method"
          defaultValue={type === "electricity" ? "cash" : "upi"}
          key={type}
        >
          {(type === "electricity"
            ? ELECTRICITY_METHODS
            : PAYMENT_METHODS.filter((m) => m !== "utility")
          ).map((m) => (
            <option key={m} value={m}>
              {METHOD_LABEL[m]}
            </option>
          ))}
        </Select>
      </div>
      <Field label="Note" name="note" placeholder="Optional, e.g. UPI ref" maxLength={300} />
    </EntryForm>
  );
}

/** Electricity bill, entered by amount when it arrives. Optionally settled in the same step. */
function ElectricityForm({ rows, tenantId }: { rows: Pick[]; tenantId?: string }) {
  const [paid, setPaid] = useState<"" | (typeof ELECTRICITY_METHODS)[number]>("");
  return (
    <EntryForm
      kind="addElectricityBill"
      cta="Save electricity bill"
      build={(v) => {
        const data = {
          id: crypto.randomUUID(),
          tenantId: v.str("tenantId"),
          month: v.str("month"),
          amount: v.paise("amount"),
          note: v.str("note"),
          payment: paid ? { id: crypto.randomUUID(), paidOn: v.str("paidOn"), method: paid } : null,
        };
        return {
          data,
          label: `${monthLabel(data.month)} electricity ${fmt(data.amount)} for ${tenantName(rows, data.tenantId)}`,
        };
      }}
    >
      <TenantSelect rows={rows} tenantId={tenantId} />
      <div className="grid grid-cols-2 gap-6">
        <Field label="Bill month" name="month" type="month" defaultValue={thisMonth()} required />
        <Field
          label="Bill amount (₹)"
          name="amount"
          type="number"
          inputMode="decimal"
          min="0.01"
          step="0.01"
          required
          big
        />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Select
          label="Paid?"
          name="paid"
          value={paid}
          onChange={(e) => setPaid(e.currentTarget.value as typeof paid)}
        >
          <option value="">Not yet</option>
          <option value="utility">Tenant paid utility directly</option>
          {ELECTRICITY_METHODS.filter((m) => m !== "utility").map((m) => (
            <option key={m} value={m}>
              Paid to me · {METHOD_LABEL[m]}
            </option>
          ))}
        </Select>
        {paid && (
          <Field label="Paid on" name="paidOn" type="date" defaultValue={today()} required />
        )}
      </div>
      <Field label="Note" name="note" placeholder="Optional, e.g. consumer no." maxLength={300} />
      <p className="-mt-2 text-xs text-white/40">
        Electricity is tracked as its own balance and is never counted as income, whether the tenant
        pays the utility directly or pays it through you.
      </p>
    </EntryForm>
  );
}

const CHARGE_KINDS = ["other", "maintenance", "rent"] as const;

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
          type: v.str("type") as (typeof CHARGE_KINDS)[number],
          amount: v.paise("amount"),
          note: v.str("note"),
        };
        return { data, label: `${data.type} charge ${fmt(data.amount)}` };
      }}
    >
      <TenantSelect rows={rows} tenantId={tenantId} />
      <div className="grid grid-cols-2 gap-6">
        <Select label="Type" name="type" defaultValue="other">
          {CHARGE_KINDS.map((t) => (
            <option key={t} value={t}>
              {cap(t)}
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
      <Field label="Note" name="note" placeholder="e.g. Repair passed on" maxLength={300} />
      <p className="-mt-2 text-xs text-white/40">
        Rent and maintenance are added automatically each month. Use this for one-off charges or a
        prorated first month (negative amount). Electricity bills go in the ⚡ tab.
      </p>
    </EntryForm>
  );
}

function ExpenseForm({ rows }: { rows: Pick[] }) {
  const props = [...new Map(rows.map((r) => [r.propertyId, r.propertyName])).entries()];
  const rooms = [...new Map(rows.filter((r) => r.unitId).map((r) => [r.unitId, r])).values()];
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
        <Select label="Room no." name="unitId" defaultValue="" key={propertyId}>
          <option value="">Whole property</option>
          {rooms
            .filter((r) => r.propertyId === propertyId)
            .map((r) => (
              <option key={r.unitId} value={r.unitId!}>
                {r.unitName}
              </option>
            ))}
        </Select>
        <Select label="Category" name="category" defaultValue="maintenance">
          {EXPENSE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {cap(c)}
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
