import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { TenantFields } from "#/components/TenantFields";
import {
  Button,
  Empty,
  ErrorText,
  PageHeader,
  Select,
  formValues,
  useAction,
} from "#/components/pop";
import { getRooms } from "#/fns/read.functions";
import { createTenant } from "#/fns/write.functions";
import { fmt, today } from "#/lib/money";
import { useOnline } from "#/lib/outbox";

export const Route = createFileRoute("/tenants/new")({
  ssr: true,
  validateSearch: z.object({ unitId: z.string().min(1).max(64).optional().catch(undefined) }),
  loader: () => getRooms(),
  head: () => ({ meta: [{ title: "New tenant · Property Manager" }] }),
  component: NewTenant,
});

function NewTenant() {
  const rooms = Route.useLoaderData();
  const search = Route.useSearch();
  const [unitId, setUnitId] = useState(search.unitId ?? "");
  const navigate = useNavigate();
  const online = useOnline();
  const { busy, error, run } = useAction();
  const room = rooms.find((r) => r.id === unitId);

  if (rooms.length === 0) {
    return (
      <>
        <PageHeader title="New tenant" />
        <Empty>
          No rooms yet.{" "}
          <Link to="/properties" className="underline">
            Add a room
          </Link>{" "}
          to a property first.
        </Empty>
      </>
    );
  }

  return (
    <>
      <PageHeader kicker={<Link to="/tenants">← Tenants</Link>} title="New tenant" />
      <form
        className="grid max-w-2xl gap-6"
        onSubmit={async (e) => {
          e.preventDefault();
          const v = formValues(e.currentTarget);
          const out = await run(() =>
            createTenant({
              data: {
                unitId: v.str("unitId"),
                name: v.str("name"),
                phone: v.str("phone"),
                email: v.str("email"),
                moveIn: v.str("moveIn"),
                agreementEnd: v.opt("agreementEnd"),
                rent: v.paise("rent"),
                deposit: v.paise("deposit"),
                maintenance: v.paise("maintenance"),
                dueDay: v.int("dueDay"),
                notes: v.str("notes"),
              },
            }),
          );
          if (out) void navigate({ to: "/tenants/$tenantId", params: { tenantId: out.id } });
        }}
      >
        <Select
          label="Room no."
          name="unitId"
          required
          value={unitId}
          onChange={(e) => setUnitId(e.currentTarget.value)}
        >
          <option value="" disabled>
            Choose a room
          </option>
          {rooms.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} · {r.propertyName}
              {r.active ? ` · ${r.active} tenant${r.active > 1 ? "s" : ""}` : " · vacant"}
            </option>
          ))}
        </Select>
        {room && room.active > 0 && (
          <p className="-mt-3 text-xs text-warn">
            Room {room.name} already has {room.active} active tenant{room.active > 1 ? "s" : ""}.
          </p>
        )}
        <TenantFields defaults={{ moveIn: today(), rent: room?.rent || undefined }} />
        {room?.rent ? (
          <p className="-mt-3 text-xs text-white/40">Asking rent for this room: {fmt(room.rent)}</p>
        ) : null}
        <div>
          <Button tone="mint" size="lg" disabled={busy || !online}>
            {online ? (busy ? "Saving…" : "Create tenant") : "Needs a connection"}
          </Button>
        </div>
        <ErrorText error={error} />
      </form>
    </>
  );
}
