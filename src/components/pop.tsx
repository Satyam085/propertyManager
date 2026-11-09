// NeoPop-inspired UI kit: sharp corners, 3px skewed "plunk" edges, caps labels, dark surfaces.
import { useRouter } from "@tanstack/react-router";
import { useState, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { fmt, toPaise } from "#/lib/money";

const cx = (...c: Array<string | false | null | undefined>) => c.filter(Boolean).join(" ");

// face, text, right edge, bottom edge (edges = the colour's 600/700 shades)
const TONES = {
  white: ["bg-white text-ink", "#e0e0e0", "#8a8a8a"],
  mint: ["bg-mint text-ink", "#29b379", "#1e8057"],
  lime: ["bg-lime text-ink", "#a0b22d", "#727f20"],
  purple: ["bg-purple text-white", "#4a25b3", "#351a80"],
  pink: ["bg-pink text-white", "#b32e4e", "#802138"],
  dark: ["bg-ink text-white border border-white", "#8a8a8a", "#3d3d3d"],
} as const;
export type Tone = keyof typeof TONES;

const edges = (tone: Tone) =>
  ({ "--edge-r": TONES[tone][1], "--edge-b": TONES[tone][2] }) as CSSProperties;

type ButtonLook = {
  tone?: Tone;
  size?: "sm" | "md" | "lg";
  flat?: boolean;
  className?: string;
  style?: CSSProperties;
};

/** Button look for any element (e.g. a router <Link>), so links never nest a <button>. */
export const buttonStyle = ({
  tone = "white",
  size = "md",
  flat,
  className,
  style,
}: ButtonLook) => ({
  style: flat ? style : { ...edges(tone), ...style },
  className: cx(
    "inline-flex items-center justify-center gap-2 font-bold whitespace-nowrap select-none disabled:opacity-50",
    TONES[tone][0],
    !flat && "plunk plunk-press",
    size === "sm" && "h-[30px] px-4 text-[11px]",
    size === "md" && "h-10 px-5 text-[13px]",
    size === "lg" && "h-[50px] px-[30px] text-sm",
    className,
  ),
});

export function Button({
  tone,
  size,
  flat,
  className,
  style,
  ...props
}: ComponentProps<"button"> & ButtonLook) {
  return <button {...props} {...buttonStyle({ tone, size, flat, className, style })} />;
}

/** Link-style action: text with an underline, NeoPop "link" kind. */
export function TextButton({ className, ...props }: ComponentProps<"button">) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex border-b border-current pb-px text-[13px] font-semibold text-white/70 hover:text-white disabled:opacity-40",
        className,
      )}
    />
  );
}

const EDGE = {
  none: null,
  mute: ["#3d3d3d", "#262626"],
  ok: ["#06c270", "#04804a"],
  bad: ["#ee4d37", "#a33525"],
  warn: ["#f08d32", "#a35f21"],
  lime: ["#a0b22d", "#727f20"],
  purple: ["#4a25b3", "#351a80"],
} as const;

export function Card({
  edge = "mute",
  className,
  style,
  ...props
}: ComponentProps<"div"> & { edge?: keyof typeof EDGE }) {
  const e = EDGE[edge];
  return (
    <div
      {...props}
      style={e ? ({ "--edge-r": e[0], "--edge-b": e[1], ...style } as CSSProperties) : style}
      className={cx("border border-line bg-surface p-4", e && "plunk", className)}
    />
  );
}

const TAGS = {
  ok: "bg-ok",
  bad: "bg-bad",
  warn: "bg-warn",
  info: "bg-info",
  mute: "bg-edge",
  lime: "bg-lime !text-ink",
} as const;
export type TagTone = keyof typeof TAGS;

export const Tag = ({ tone = "mute", children }: { tone?: TagTone; children: ReactNode }) => (
  <span className={cx("caps inline-block px-1.5 py-0.5 leading-none text-[#fbfbfb]", TAGS[tone])}>
    {children}
  </span>
);

export const STATUS_TAG = { paid: "ok", due: "warn", overdue: "bad" } as const;

export function Field({
  label,
  big,
  className,
  ...props
}: ComponentProps<"input"> & { label: string; big?: boolean }) {
  return (
    <label className={cx("block", className)}>
      <span className="caps mb-2.5 block text-white/50">{label}</span>
      <input
        {...props}
        className={cx(
          "w-full border-0 border-b border-white/20 bg-transparent pb-1.5 font-semibold text-white/90 outline-none placeholder:text-white/30 focus:border-white",
          big ? "text-[22px] font-bold" : "text-base",
        )}
      />
    </label>
  );
}

export function Select({
  label,
  children,
  className,
  ...props
}: ComponentProps<"select"> & { label: string }) {
  return (
    <label className={cx("block", className)}>
      <span className="caps mb-2.5 block text-white/50">{label}</span>
      <select
        {...props}
        className="w-full appearance-none border-0 border-b border-white/20 bg-transparent bg-[length:10px] bg-[right_2px_center] bg-no-repeat pb-1.5 text-base font-semibold text-white/90 outline-none focus:border-white"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23ffffff80'/%3E%3C/svg%3E\")",
        }}
      >
        {children}
      </select>
    </label>
  );
}

export function TextArea({ label, ...props }: ComponentProps<"textarea"> & { label: string }) {
  return (
    <label className="block">
      <span className="caps mb-2.5 block text-white/50">{label}</span>
      <textarea
        rows={2}
        {...props}
        className="w-full resize-y border border-white/20 bg-transparent p-2 text-sm text-white/90 outline-none focus:border-white"
      />
    </label>
  );
}

export function Stat({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "ok" | "bad" | "lime";
  hint?: ReactNode;
}) {
  return (
    <div className="border border-line bg-surface p-4">
      <div className="caps text-white/50">{label}</div>
      <div
        className={cx(
          "mt-2 text-2xl font-extrabold tabular-nums tracking-tight",
          tone === "ok" && "text-mint",
          tone === "bad" && "text-pink",
          tone === "lime" && "text-lime",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-white/50">{hint}</div>}
    </div>
  );
}

export const Money = ({ paise, className }: { paise: number; className?: string }) => (
  <span className={cx("tabular-nums", className)}>{fmt(paise)}</span>
);

export function PageHeader({
  title,
  kicker,
  actions,
}: {
  title: ReactNode;
  kicker?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {kicker && <div className="caps mb-1 text-white/50">{kicker}</div>}
        <h1 className="font-serif text-[28px] leading-tight font-bold md:text-[34px]">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </header>
  );
}

export const Section = ({
  title,
  children,
  actions,
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
}) => (
  <section className="mt-8">
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="caps text-[11px] text-white/70">{title}</h2>
      {actions}
    </div>
    {children}
  </section>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="border border-dashed border-white/15 p-6 text-center text-sm text-white/50">
    {children}
  </div>
);

export const ErrorText = ({ error }: { error: string | null }) =>
  error ? (
    <p role="alert" className="mt-3 border-l-2 border-bad pl-2 text-sm text-[#f47564]">
      {error}
    </p>
  ) : null;

// ---------- form plumbing ----------

/** Turns a thrown server-fn error (often zod issues as JSON) into one readable line. */
export function errorMessage(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  try {
    const issues = JSON.parse(msg) as Array<{ path?: unknown[]; message: string }>;
    if (Array.isArray(issues))
      return issues.map((i) => `${i.path?.join(".") || "value"}: ${i.message}`).join("; ");
  } catch {}
  return msg;
}

/** Runs a mutation, then refreshes route data. */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      const out = await fn();
      await router.invalidate();
      return out;
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, run, setError };
}

/** Typed reads from a submitted form. */
export function formValues(form: HTMLFormElement) {
  const f = new FormData(form);
  const str = (k: string) => {
    const v = f.get(k);
    return typeof v === "string" ? v.trim() : "";
  };
  return {
    str,
    opt: (k: string) => str(k) || null,
    int: (k: string) => Number.parseInt(str(k) || "0", 10),
    paise: (k: string) => toPaise(Number(str(k) || "0")),
  };
}
