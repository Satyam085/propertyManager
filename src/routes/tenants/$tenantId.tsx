import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Files } from "#/components/Files";
import { TenantFields } from "#/components/TenantFields";
import {
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  Money,
  PageHeader,
  STATUS_TAG,
  Section,
  Stat,
  Tag,
  TextButton,
  buttonStyle,
  formValues,
  useAction,
} from "#/components/pop";
import { getTenant } from "#/fns/read.functions";
import { deleteEntry, moveOut, updateTenant } from "#/fns/write.functions";
import { fmt, monthLabel, ordinal, today } from "#/lib/money";
import { useOnline } from "#/lib/outbox";

export const Route = createFileRoute("/tenants/$tenantId")({
  ssr: true,
  loader: ({ params }) => getTenant({ data: { id: params.tenantId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.tenant.name ?? "Tenant"} · Property Manager` }],
  }),
  component: TenantPage,
});

type Data = Awaited<ReturnType<typeof getTenant>>;

function TenantPage() {
  const data = Route.useLoaderData();
  const { tenant: t } = data;
  const [editing, setEditing] = useState(false);
  const online = useOnline();
  const active = !t.moveOut;

  return (
    <>
      <PageHeader
        kicker={
          <Link to="/properties/$propertyId" params={{ propertyId: t.propertyId }}>
            {t.propertyName} · {t.unitName}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.name}
            {active ? (
              <Tag tone={STATUS_TAG[t.status]}>{t.status}</Tag>
            ) : (
              <Tag>moved out {t.moveOut}</Tag>
            )}
          </span>
        }
        actions={
          <>
            <Link
              to="/record"
              search={{ tab: "payment", tenantId: t.id }}
              {...buttonStyle({ tone: "mint", size: "sm" })}
            >
              Record payment
            </Link>
            <Link
              to="/record"
              search={{ tab: "charge", tenantId: t.id }}
              {...buttonStyle({ tone: "dark", size: "sm" })}
            >
              Add charge
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Balance due"
          value={<Money paise={Math.max(0, t.balance)} />}
          tone={t.balance > 0 ? "bad" : "ok"}
          hint={t.balance < 0 ? `${fmt(-t.balance)} in advance` : undefined}
        />
        <Stat
          label="Deposit held"
          value={<Money paise={t.depositHeld} />}
          hint={`agreed ${fmt(t.deposit)}`}
        />
        <Stat
          label="Rent"
          value={<Money paise={t.rent} />}
          hint={`due on the ${ordinal(t.dueDay)}${t.maintenance ? ` · +${fmt(t.maintenance)} maint.` : ""}`}
        />
        <Stat
          label="Since"
          value={t.moveIn}
          hint={t.agreementEnd ? `agreement till ${t.agreementEnd}` : "no agreement end set"}
        />
      </div>

      <Contact tenant={t} />

      <Section title="Statement">
        <Statement data={data} online={online} />
      </Section>

      <Section title="Deposit">
        <Deposit data={data} online={online} />
      </Section>

      <Section
        title="Meter readings"
        actions={
          <Link
            to="/record"
            search={{ tab: "reading" }}
            className="text-xs font-semibold text-white/60 hover:text-white"
          >
            ＋ Reading
          </Link>
        }
      >
        {data.readings.length === 0 ? (
          <Empty>
            {t.elecRate ? "No readings yet" : "No electricity rate set for this tenant"}
          </Empty>
        ) : (
          <ul className="divide-y divide-line border border-line bg-surface text-sm">
            {data.readings.map((r) => (
              <li key={r.id} className="flex justify-between px-4 py-2.5">
                <span className="text-white/60">{r.readOn}</span>
                <span className="font-semibold tabular-nums">{r.value} kWh</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Documents">
        <Files ownerType="tenant" ownerId={t.id} files={data.docs} label="Add ID / agreement" />
      </Section>

      <Section
        title="Tenancy"
        actions={
          <TextButton disabled={!online} onClick={() => setEditing((x) => !x)}>
            {editing ? "Close" : "Edit details"}
          </TextButton>
        }
      >
        {editing ? (
          <EditTenant tenant={t} onDone={() => setEditing(false)} />
        ) : (
          <MoveOut tenant={t} online={online} />
        )}
      </Section>
    </>
  );
}

function Contact({ tenant: t }: { tenant: Data["tenant"] }) {
  const digits = t.phone.replace(/\D/g, "");
  const wa = digits.length === 10 ? `91${digits}` : digits;
  const reminder = `Hi ${t.name}, a gentle reminder that ${fmt(t.balance)} is due for ${t.unitName}, ${t.propertyName}. Thank you!`;
  if (!t.phone && !t.email) return null;
  return (
    <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
      {t.phone && (
        <a href={`tel:${t.phone}`} className="font-semibold text-white/70 hover:text-white">
          ☎ {t.phone}
        </a>
      )}
      {t.email && (
        <a href={`mailto:${t.email}`} className="font-semibold text-white/70 hover:text-white">
          ✉ {t.email}
        </a>
      )}
      {digits && t.balance > 0 && (
        <a
          href={`https://wa.me/${wa}?text=${encodeURIComponent(reminder)}`}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-mint hover:underline"
        >
          Send WhatsApp reminder →
        </a>
      )}
    </div>
  );
}

/** Charges and rent payments merged, newest first, with the running balance after each line. */
function Statement({ data, online }: { data: Data; online: boolean }) {
  const { run, error, busy } = useAction();
  const lines = [
    ...data.charges.map((c) => ({
      id: c.id,
      kind: "charge" as const,
      date: `${c.month}-01`,
      sort: `${c.month}-01 ${c.createdAt}`,
      title: `${c.type} · ${monthLabel(c.month)}`,
      note: c.note,
      amount: c.amount,
    })),
    ...data.payments
      .filter((p) => p.type === "rent")
      .map((p) => ({
        id: p.id,
        kind: "payment" as const,
        date: p.paidOn,
        sort: `${p.paidOn} ${p.createdAt}`,
        title: `Paid · ${p.method.toUpperCase()}`,
        note: p.note,
        amount: -p.amount,
      })),
  ].sort((a, b) => a.sort.localeCompare(b.sort));

  let running = 0;
  const withBalance = lines.map((l) => ({ ...l, balance: (running += l.amount) })).reverse();

  if (withBalance.length === 0)
    return <Empty>No charges yet. Rent is added on the 1st of each month.</Empty>;
  return (
    <>
      <ul className="divide-y divide-line border border-line bg-surface">
        {withBalance.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold capitalize">{l.title}</div>
              <div className="truncate text-xs text-white/40">
                {l.date}
                {l.note && ` · ${l.note}`}
              </div>
            </div>
            <div className="text-right">
              <Money
                paise={Math.abs(l.amount)}
                className={l.amount < 0 ? "font-bold text-mint" : "font-bold"}
              />
              <div className="text-[11px] text-white/40 tabular-nums">bal {fmt(l.balance)}</div>
            </div>
            <TextButton
              aria-label={`Delete ${l.title}`}
              disabled={!online || busy}
              className="text-[11px]"
              onClick={() =>
                confirm(`Delete "${l.title}" (${fmt(Math.abs(l.amount))})?`) &&
                run(() => deleteEntry({ data: { kind: l.kind, id: l.id } }))
              }
            >
              ✕
            </TextButton>
          </li>
        ))}
      </ul>
      <ErrorText error={error} />
    </>
  );
}

function Deposit({ data, online }: { data: Data; online: boolean }) {
  const { run, error, busy } = useAction();
  const t = data.tenant;
  const rows = data.payments.filter((p) => p.type !== "rent");
  const short = t.deposit - t.depositHeld;
  return (
    <>
      {short > 0 && (
        <p className="mb-3 text-sm text-warn">
          {fmt(short)} of the agreed deposit is still to be collected.{" "}
          <Link to="/record" search={{ tab: "payment", tenantId: t.id }} className="underline">
            Record it
          </Link>{" "}
          (choose “Security deposit received”).
        </p>
      )}
      {rows.length === 0 ? (
        <Empty>No deposit received yet</Empty>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span className="flex-1">
                <span className="text-white/50">{p.paidOn}</span> ·{" "}
                {p.type === "deposit" ? "Received" : "Refunded"} · {p.method.toUpperCase()}
                {p.note && <span className="text-white/50"> · {p.note}</span>}
              </span>
              <Money
                paise={p.amount}
                className={p.type === "refund" ? "font-bold text-pink" : "font-bold"}
              />
              <TextButton
                aria-label="Delete deposit entry"
                disabled={!online || busy}
                className="text-[11px]"
                onClick={() =>
                  confirm("Delete this deposit entry?") &&
                  run(() => deleteEntry({ data: { kind: "payment", id: p.id } }))
                }
              >
                ✕
              </TextButton>
            </li>
          ))}
        </ul>
      )}
      <ErrorText error={error} />
    </>
  );
}

function EditTenant({ tenant: t, onDone }: { tenant: Data["tenant"]; onDone: () => void }) {
  const { busy, error, run } = useAction();
  return (
    <Card edge="lime">
      <form
        className="grid gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          const ok = await run(() =>
            updateTenant({
              data: {
                id: t.id,
                name: v.str("name"),
                phone: v.str("phone"),
                email: v.str("email"),
                agreementEnd: v.opt("agreementEnd"),
                rent: v.paise("rent"),
                deposit: v.paise("deposit"),
                maintenance: v.paise("maintenance"),
                elecRate: v.paise("elecRate"),
                dueDay: v.int("dueDay"),
                notes: v.str("notes"),
              },
            }),
          );
          if (ok) onDone();
        }}
      >
        <TenantFields defaults={t} editing />
        <p className="-mt-2 text-xs text-white/40">
          A new rent amount applies from the next month raised; past charges stay as billed.
        </p>
        <div>
          <Button tone="mint" disabled={busy}>
            Save changes
          </Button>
        </div>
        <ErrorText error={error} />
      </form>
    </Card>
  );
}

function MoveOut({ tenant: t, online }: { tenant: Data["tenant"]; online: boolean }) {
  const { busy, error, run } = useAction();
  if (t.moveOut) {
    const refund = t.depositHeld - Math.max(0, t.balance);
    return (
      <Card>
        <p className="text-sm text-white/70">
          Moved out on <b>{t.moveOut}</b>. Deposit held {fmt(t.depositHeld)}, dues{" "}
          {fmt(Math.max(0, t.balance))}:{" "}
          {refund >= 0 ? (
            <b className="text-mint">refund {fmt(refund)}</b>
          ) : (
            <b className="text-pink">still owes {fmt(-refund)}</b>
          )}
          .
        </p>
        <TextButton
          className="mt-4"
          disabled={!online || busy}
          onClick={() => run(() => moveOut({ data: { id: t.id, moveOut: null } }))}
        >
          Undo move-out
        </TextButton>
        <ErrorText error={error} />
      </Card>
    );
  }
  return (
    <Card>
      <form
        className="flex flex-wrap items-end gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          const date = formValues(e.currentTarget).str("moveOut");
          if (
            confirm(
              `Mark ${t.name} as moved out on ${date}? Rent stops being charged after that month.`,
            )
          ) {
            void run(() => moveOut({ data: { id: t.id, moveOut: date } }));
          }
        }}
      >
        <Field
          label="Move-out date"
          name="moveOut"
          type="date"
          required
          defaultValue={today()}
          min={t.moveIn}
          className="min-w-44 flex-1"
        />
        <Button tone="pink" size="sm" disabled={!online || busy}>
          Move out
        </Button>
      </form>
      <p className="mt-3 text-xs text-white/40">
        After moving out, settle the deposit: deposit held minus dues is the refund. Record it as a
        “Deposit refunded” payment.
      </p>
      <ErrorText error={error} />
    </Card>
  );
}
