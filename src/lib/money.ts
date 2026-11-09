// Shared (client + server) money and date helpers. Money is integer paise.

// ponytail: single-landlord app, so timezone and currency are constants
export const TZ = "Asia/Kolkata";
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

export const fmt = (paise: number) => inr.format(paise / 100);
export const toPaise = (rupees: number) => Math.round(rupees * 100);

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
export const today = (d = new Date()) => ymd.format(d); // YYYY-MM-DD in IST
export const monthOf = (date: string) => date.slice(0, 7);
export const thisMonth = () => monthOf(today());

export function addMonths(month: string, n: number) {
  const [y, m] = month.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export function monthLabel(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Months a tenancy owes recurring charges for, up to `upTo` (inclusive).
 * The move-in month is always charged; after that a month is charged if the tenant is
 * still in on its 1st (move-out on the 1st = that month is not charged).
 */
export function chargeMonths(moveIn: string, moveOut: string | null, upTo: string) {
  let last = upTo;
  if (moveOut) {
    const outMonth = moveOut.endsWith("-01") ? addMonths(monthOf(moveOut), -1) : monthOf(moveOut);
    if (outMonth < last) last = outMonth;
  }
  const out: string[] = [];
  for (let m = monthOf(moveIn); m <= last; m = addMonths(m, 1)) out.push(m);
  if (out.length === 0) out.push(monthOf(moveIn)); // moved out within the move-in month
  return out;
}

/** Rent is overdue if anything older than this month is unpaid, or this month's due day passed. */
export function isOverdue(
  balance: number,
  thisMonthCharges: number,
  dueDay: number,
  todayStr = today(),
) {
  if (balance <= 0) return false;
  return balance > thisMonthCharges || Number(todayStr.slice(8, 10)) > dueDay;
}

// ---------- domain enums (shared by the DB schema, validators and UI) ----------
export const CHARGE_TYPES = ["rent", "maintenance", "electricity", "other"] as const;
// "electricity" payments settle electricity bills: pass-through money, never counted as income
export const PAYMENT_TYPES = ["rent", "electricity", "deposit", "refund"] as const;
// "utility" = the tenant paid the electricity company directly
export const PAYMENT_METHODS = ["upi", "cash", "bank", "cheque", "utility"] as const;
export const METHOD_LABEL: Record<(typeof PAYMENT_METHODS)[number], string> = {
  upi: "UPI",
  cash: "Cash",
  bank: "Bank transfer",
  cheque: "Cheque",
  utility: "Paid to utility directly",
};
// an electricity bill is settled either straight to the utility, or to you in cash/UPI only
export const ELECTRICITY_METHODS = ["cash", "upi", "utility"] as const;
export const EXPENSE_CATEGORIES = [
  "maintenance",
  "repair",
  "utility",
  "tax",
  "society",
  "misc",
] as const;
export const FILE_OWNERS = ["property", "tenant", "expense", "payment"] as const;

export const ordinal = (n: number) =>
  `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
