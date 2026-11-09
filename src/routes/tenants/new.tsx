import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { getVacantUnits } from "#/fns/read.functions";
import { createTenant } from "#/fns/write.functions";
import { fmt, today } from "#/lib/money";
import { useOnline } from "#/lib/outbox";

export const Route = createFileRoute("/tenants/new")({
  ssr: true,
  validateSearch: z.object({ unitId: z.string().min(1).max(64).optional().catch(undefined) }),
  loader: () => getVacantUnits(),
  head: () => ({ meta: [{ title: "New tenant · Property Manager" }] }),
  component: NewTenant,
});

function NewTenant() {
  const units = Route.useLoaderData();
  const { unitId } = Route.useSearch();
  const navigate = useNavigate();
  const online = useOnline();
  const { busy, error, run } = useAction();

  if (units.length === 0) {
    return (
      <>
        <PageHeader title="New tenant" />
        <Empty>
          Every unit is let.{" "}
          <Link to="/properties" className="underline">
            Add a unit
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
                elecRate: v.paise("elecRate"),
                dueDay: v.int("dueDay"),
                notes: v.str("notes"),
              },
            }),
          );
          if (out) void navigate({ to: "/tenants/$tenantId", params: { tenantId: out.id } });
        }}
      >
        <Select label="Unit" name="unitId" required defaultValue={unitId ?? ""}>
          <option value="" disabled>
            Choose a vacant unit
          </option>
          {units.map((u) => (
            <option key={u.id} value={u.id}>
              {u.propertyName} · {u.name}
              {u.rent ? ` (asking ${fmt(u.rent)})` : ""}
            </option>
          ))}
        </Select>
        <TenantFields
          defaults={{ moveIn: today(), rent: units.find((u) => u.id === unitId)?.rent }}
        />
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
