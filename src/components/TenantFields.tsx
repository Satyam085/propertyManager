import { Field, TextArea } from "./pop";

type Defaults = Partial<{
  name: string;
  phone: string;
  email: string;
  moveIn: string;
  agreementEnd: string | null;
  rent: number;
  deposit: number;
  maintenance: number;
  elecRate: number;
  dueDay: number;
  notes: string;
}>;

const rupees = (paise?: number) => (paise ? paise / 100 : undefined);

/** Tenancy fields shared by the create and edit forms (amounts in ₹, sent as paise). */
export function TenantFields({
  defaults: d = {},
  editing,
}: {
  defaults?: Defaults;
  editing?: boolean;
}) {
  return (
    <>
      <Field
        label="Name"
        name="name"
        required
        maxLength={100}
        defaultValue={d.name}
        autoComplete="off"
      />
      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="Phone" name="phone" type="tel" maxLength={20} defaultValue={d.phone} />
        <Field label="Email" name="email" type="email" maxLength={100} defaultValue={d.email} />
      </div>
      <div className="grid gap-6 sm:grid-cols-2">
        {!editing && (
          <Field label="Move-in date" name="moveIn" type="date" required defaultValue={d.moveIn} />
        )}
        <Field
          label="Agreement ends"
          name="agreementEnd"
          type="date"
          defaultValue={d.agreementEnd ?? undefined}
        />
      </div>
      <div className="grid grid-cols-2 gap-6">
        <Field
          label="Rent / month (₹)"
          name="rent"
          type="number"
          inputMode="decimal"
          min="1"
          step="0.01"
          required
          big
          defaultValue={rupees(d.rent)}
        />
        <Field
          label="Rent due day"
          name="dueDay"
          type="number"
          inputMode="numeric"
          min="1"
          max="28"
          required
          defaultValue={d.dueDay ?? 5}
        />
      </div>
      <div className="grid grid-cols-3 gap-6">
        <Field
          label="Deposit (₹)"
          name="deposit"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          defaultValue={rupees(d.deposit)}
        />
        <Field
          label="Maintenance / mo (₹)"
          name="maintenance"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          defaultValue={rupees(d.maintenance)}
        />
        <Field
          label="Electricity ₹ / kWh"
          name="elecRate"
          type="number"
          inputMode="decimal"
          min="0"
          step="0.01"
          defaultValue={rupees(d.elecRate)}
        />
      </div>
      <TextArea label="Notes" name="notes" maxLength={2000} defaultValue={d.notes} />
    </>
  );
}
