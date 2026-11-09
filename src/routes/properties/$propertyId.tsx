import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Files } from "#/components/Files";
import {
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  Money,
  PageHeader,
  RoomNo,
  STATUS_TAG,
  Section,
  Tag,
  TextButton,
  errorMessage,
  formValues,
  useAction,
} from "#/components/pop";
import { getProperty } from "#/fns/read.functions";
import { deleteProperty, deleteUnit, saveProperty, saveUnit } from "#/fns/write.functions";
import { useOnline } from "#/lib/outbox";

export const Route = createFileRoute("/properties/$propertyId")({
  ssr: true,
  loader: ({ params }) => getProperty({ data: { id: params.propertyId } }),
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.property.name ?? "Property"} · Property Manager` }],
  }),
  component: PropertyPage,
});

function PropertyPage() {
  const { property, units, expenses, photos } = Route.useLoaderData();
  const online = useOnline();
  const [editing, setEditing] = useState(false);
  const { busy, error, run, setError } = useAction();
  const navigate = useNavigate();

  return (
    <>
      <PageHeader
        kicker={<Link to="/properties">← Properties</Link>}
        title={property.name}
        actions={
          <Button tone="dark" size="sm" disabled={!online} onClick={() => setEditing((x) => !x)}>
            {editing ? "Close" : "Edit"}
          </Button>
        }
      />
      {property.address && !editing && (
        <p className="-mt-4 mb-6 text-sm text-white/60">{property.address}</p>
      )}

      {editing && (
        <Card edge="lime" className="mb-6">
          <form
            className="grid gap-6"
            onSubmit={async (e) => {
              e.preventDefault();
              const v = formValues(e.currentTarget);
              await run(() =>
                saveProperty({
                  data: { id: property.id, name: v.str("name"), address: v.str("address") },
                }),
              );
              setEditing(false);
            }}
          >
            <Field label="Name" name="name" defaultValue={property.name} required maxLength={100} />
            <Field label="Address" name="address" defaultValue={property.address} maxLength={300} />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Button tone="mint" disabled={busy}>
                Save
              </Button>
              <TextButton
                type="button"
                className="text-[#f47564]"
                onClick={async () => {
                  if (!confirm(`Delete ${property.name} and all its units and expenses?`)) return;
                  // not via run(): it would reload this (now deleted) property before we leave
                  try {
                    await deleteProperty({ data: { id: property.id } });
                    void navigate({ to: "/properties" });
                  } catch (err) {
                    setError(errorMessage(err));
                  }
                }}
              >
                Delete property
              </TextButton>
            </div>
            <ErrorText error={error} />
          </form>
        </Card>
      )}

      <Section
        title={`Rooms · ${units.filter((u) => u.tenants.length).length}/${units.length} let`}
      >
        {units.length === 0 ? (
          <Empty>No rooms yet. Add the rooms, flats, houses or shops you rent out.</Empty>
        ) : (
          <ul className="divide-y divide-line border border-line bg-surface">
            {units.map((u) => (
              <li key={u.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <RoomNo room={u.name} />
                  <div className="min-w-0 flex-1 text-sm text-white/50">
                    {u.tenants.length === 0 ? (
                      <>
                        Vacant · asking <Money paise={u.rent} />
                      </>
                    ) : (
                      `${u.tenants.length} tenant${u.tenants.length > 1 ? "s" : ""}`
                    )}
                  </div>
                  <Link
                    to="/tenants/new"
                    search={{ unitId: u.id }}
                    className="caps border border-white px-2.5 py-2 hover:bg-white hover:text-ink"
                  >
                    ＋ Tenant
                  </Link>
                  {u.tenants.length === 0 && (
                    <TextButton
                      disabled={!online}
                      className="text-[11px]"
                      onClick={() =>
                        confirm(`Delete room ${u.name}?`) &&
                        run(() => deleteUnit({ data: { id: u.id } }))
                      }
                    >
                      Delete
                    </TextButton>
                  )}
                </div>
                {u.tenants.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-line pt-2">
                    {u.tenants.map((t) => (
                      <li key={t.id}>
                        <Link
                          to="/tenants/$tenantId"
                          params={{ tenantId: t.id }}
                          className="flex items-center gap-2 text-sm hover:text-white"
                        >
                          <span className="min-w-0 flex-1 truncate text-white/70">
                            {t.name} · <Money paise={t.rent} />
                            /mo
                          </span>
                          <Tag tone={STATUS_TAG[t.status]}>{t.status}</Tag>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
        <AddUnit propertyId={property.id} />
      </Section>

      <Section
        title="Recent expenses"
        actions={
          <Link
            to="/expenses"
            search={{ propertyId: property.id }}
            className="text-xs font-semibold text-white/60 hover:text-white"
          >
            All →
          </Link>
        }
      >
        {expenses.length === 0 ? (
          <Empty>No expenses in the last 6 months</Empty>
        ) : (
          <ul className="divide-y divide-line border border-line bg-surface">
            {expenses.map((x) => (
              <li
                key={x.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="min-w-0 truncate">
                  <span className="text-white/50">{x.spentOn}</span> · {x.category}
                  {x.note && <span className="text-white/50"> · {x.note}</span>}
                </span>
                <Money paise={x.amount} className="font-semibold" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Photos & documents">
        <Files
          ownerType="property"
          ownerId={property.id}
          files={photos}
          label="Add photo or document"
        />
      </Section>
    </>
  );
}

function AddUnit({ propertyId }: { propertyId: string }) {
  const { busy, error, run } = useAction();
  const online = useOnline();
  return (
    <form
      className="mt-4 grid grid-cols-[1fr_1fr_auto] items-end gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const v = formValues(form);
        const ok = await run(() =>
          saveUnit({ data: { propertyId, name: v.str("name"), rent: v.paise("rent") } }),
        );
        if (ok) form.reset();
      }}
    >
      <Field label="New room no." name="name" required maxLength={60} placeholder="2325 A" />
      <Field
        label="Asking rent (₹)"
        name="rent"
        type="number"
        inputMode="decimal"
        min="0"
        step="1"
        placeholder="15000"
      />
      <Button tone="dark" size="sm" disabled={busy || !online}>
        ＋ Room
      </Button>
      <div className="col-span-3">
        <ErrorText error={error} />
      </div>
    </form>
  );
}
