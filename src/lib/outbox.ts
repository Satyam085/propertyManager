// Offline write queue (browser only). Payments, charges, expenses and readings carry a
// client-generated id, so replaying an entry the server already has is a no-op.
// ponytail: localStorage, not IndexedDB. Entries are small JSON; photos can't be queued.
import { useSyncExternalStore } from "react";
import { addCharge, addExpense, addReading, recordPayment } from "#/fns/write.functions";

const FNS = { recordPayment, addCharge, addExpense, addReading } as const;
export type OutboxKind = keyof typeof FNS;
type Input<K extends OutboxKind> = Parameters<(typeof FNS)[K]>[0]["data"];

export type OutboxEntry = {
  id: string;
  kind: OutboxKind;
  data: unknown;
  label: string;
  at: number;
  error?: string;
};

const KEY = "pm-outbox";
const EMPTY: OutboxEntry[] = [];
const listeners = new Set<() => void>();
let cache: OutboxEntry[] | null = null;

export function readOutbox(): OutboxEntry[] {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "[]") as OutboxEntry[];
  } catch {
    cache = [];
  }
  return cache;
}

function writeOutbox(list: OutboxEntry[]) {
  cache = list;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {}
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const isNetworkError = (e: unknown) => !navigator.onLine || e instanceof TypeError;
const call = (kind: OutboxKind, data: unknown) =>
  (FNS[kind] as (o: { data: unknown }) => Promise<unknown>)({ data });

/** Save now if possible, otherwise queue. Validation errors still throw to the form. */
export async function submit<K extends OutboxKind>(
  kind: K,
  data: Input<K> & { id: string },
  label: string,
) {
  if (navigator.onLine) {
    try {
      await call(kind, data);
      return "saved" as const;
    } catch (e) {
      if (!isNetworkError(e)) throw e;
    }
  }
  writeOutbox([...readOutbox(), { id: data.id, kind, data, label, at: Date.now() }]);
  return "queued" as const;
}

let flushing: Promise<number> | null = null;

async function replay() {
  let synced = 0;
  for (const entry of readOutbox()) {
    if (entry.error) continue; // needs a manual retry from /sync
    try {
      await call(entry.kind, entry.data);
      writeOutbox(readOutbox().filter((e) => e.id !== entry.id));
      synced++;
    } catch (e) {
      if (isNetworkError(e)) break;
      const error = e instanceof Error ? e.message : String(e);
      writeOutbox(readOutbox().map((x) => (x.id === entry.id ? { ...x, error } : x)));
    }
  }
  return synced;
}

/** Replays queued entries in order, one run at a time. Resolves to how many were synced. */
export function flush() {
  // reset in .finally (always async): with an empty queue replay() settles synchronously
  flushing ??= replay().finally(() => (flushing = null));
  return flushing;
}

export function retry(id: string) {
  writeOutbox(readOutbox().map((x) => (x.id === id ? { ...x, error: undefined } : x)));
  return flush();
}

export const discard = (id: string) => writeOutbox(readOutbox().filter((e) => e.id !== id));

export const useOutbox = () => useSyncExternalStore(subscribe, readOutbox, () => EMPTY);

const subscribeOnline = (l: () => void) => {
  addEventListener("online", l);
  addEventListener("offline", l);
  return () => {
    removeEventListener("online", l);
    removeEventListener("offline", l);
  };
};
export const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
