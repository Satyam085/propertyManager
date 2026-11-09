import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { SuffixField, TenantFields } from "#/components/TenantFields";
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
import { fmt, roomNo, today } from "#/lib/money";
import { useOnline } from "#/lib/outbox";

export const Route = createFileRoute("/tenants/new")({
  ssr: true,
  validateSearch: z.object({ unitId: z.string().min(1).max(64).optional().catch(undefined) }),
  loader: () => getRooms(),
  head: () => ({ meta: [{ title: "New tenant · Property Manager" }] }),
  component: NewTenant,
});

type Room = Awaited<ReturnType<typeof getRooms>>[number];

const takenSuffixes = (r?: Room) => (r && r.active > 0 ? r.taken.split(",") : []);
/** First free letter for a shared room; empty when the room is free. */
const nextSuffix = (taken: string[]) =>
  taken.length === 0
    ? ""
    : ("ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").find((c) => !taken.includes(c)) ?? "");

function NewTenant() {
  const rooms = Route.useLoaderData();
  const search = Route.useSearch();
  const [unitId, setUnitId] = useState(search.unitId ?? "");
  const navigate = useNavigate();
  const online = useOnline();
  const { busy, error, run } = useAction();
  const room = rooms.find((r) => r.id === unitId);
  const taken = takenSuffixes(room);

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
                label: v.str("label"),
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
        <div className="grid grid-cols-[1fr_8rem] gap-6">
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
          {/* keyed by room so the suggested suffix resets when the room changes */}
          <SuffixField key={unitId} defaultValue={nextSuffix(taken)} />
        </div>
        {room && taken.length > 0 && (
          <p className="-mt-3 text-xs text-white/50">
            Room {room.name} has {taken.length} active tenant{taken.length > 1 ? "s" : ""}
            {taken.some(Boolean) &&
              ` (${taken
                .filter(Boolean)
                .map((l) => roomNo(room.name, l))
                .join(", ")})`}
            . Each tenant in a room needs a different suffix.
            {taken.includes("") &&
              " One of them has no suffix yet, so you may want to give them one from their page (e.g. A)."}
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
