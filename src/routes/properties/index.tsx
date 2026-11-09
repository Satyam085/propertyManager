import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  Button,
  Card,
  Empty,
  ErrorText,
  Field,
  Money,
  PageHeader,
  formValues,
  useAction,
} from "#/components/pop";
import { listProperties } from "#/fns/read.functions";
import { saveProperty } from "#/fns/write.functions";
import { useOnline } from "#/lib/outbox";

export const Route = createFileRoute("/properties/")({
  ssr: true,
  loader: () => listProperties(),
  head: () => ({ meta: [{ title: "Properties · Property Manager" }] }),
  component: Properties,
});

function Properties() {
  const rows = Route.useLoaderData();
  const [adding, setAdding] = useState(false);
  return (
    <>
      <PageHeader
        kicker={`${rows.length} ${rows.length === 1 ? "property" : "properties"}`}
        title="Properties"
        actions={!adding && <Button onClick={() => setAdding(true)}>＋ Add property</Button>}
      />
      {adding && <AddProperty onDone={() => setAdding(false)} />}
      {rows.length === 0 && !adding ? (
        <Empty>Add your first property, then its units (flats, rooms, shops).</Empty>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {rows.map((p) => (
            <li key={p.id}>
              <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="block">
                <Card className="hover:bg-raised">
                  <div className="font-serif text-xl font-bold">{p.name}</div>
                  <div className="truncate text-sm text-white/50">{p.address || "No address"}</div>
                  <div className="mt-4 flex gap-6">
                    <div>
                      <div className="caps text-white/40">Let</div>
                      <div className="font-bold tabular-nums">
                        {p.occupied}/{p.units}
                      </div>
                    </div>
                    <div>
                      <div className="caps text-white/40">Monthly rent</div>
                      <Money paise={p.rent} className="font-bold" />
                    </div>
                  </div>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function AddProperty({ onDone }: { onDone: () => void }) {
  const { busy, error, run } = useAction();
  const online = useOnline();
  const navigate = useNavigate();
  return (
    <Card edge="lime" className="mb-8">
      <form
        className="grid gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          const out = await run(() =>
            saveProperty({ data: { name: v.str("name"), address: v.str("address") } }),
          );
          if (out) void navigate({ to: "/properties/$propertyId", params: { propertyId: out.id } });
        }}
      >
        <Field
          label="Name"
          name="name"
          required
          maxLength={100}
          placeholder="e.g. Green Park House"
          autoFocus
        />
        <Field label="Address" name="address" maxLength={300} />
        <div className="flex items-center gap-4">
          <Button tone="mint" disabled={busy || !online}>
            {online ? "Create" : "Needs a connection"}
          </Button>
          <button type="button" onClick={onDone} className="text-sm text-white/60">
            Cancel
          </button>
        </div>
        <ErrorText error={error} />
      </form>
    </Card>
  );
}
