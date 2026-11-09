import { createFileRoute, useRouter } from "@tanstack/react-router";
import { Button, Empty, PageHeader, Tag, TextButton, errorMessage } from "#/components/pop";
import { discard, flush, retry, useOnline, useOutbox } from "#/lib/outbox";

// ssr: false. The queue lives in this browser's localStorage, so there's nothing to render on the server.
export const Route = createFileRoute("/sync")({
  ssr: false,
  head: () => ({ meta: [{ title: "Sync queue · Property Manager" }] }),
  component: Sync,
});

function Sync() {
  const entries = useOutbox();
  const online = useOnline();
  const router = useRouter();
  const syncNow = async () => (await flush()) && router.invalidate();

  return (
    <>
      <PageHeader
        kicker={online ? "Online" : "Offline"}
        title="Sync queue"
        actions={
          entries.length > 0 && (
            <Button tone="mint" size="sm" disabled={!online} onClick={syncNow}>
              Sync now
            </Button>
          )
        }
      />
      <p className="mb-6 max-w-prose text-sm text-white/60">
        Entries recorded without a connection wait here and are sent in order when you're back
        online. Sending one twice is safe: the server ignores duplicates.
      </p>
      {entries.length === 0 ? (
        <Empty>Nothing waiting. Everything is synced.</Empty>
      ) : (
        <ul className="divide-y divide-line border border-line bg-surface">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-semibold">{e.label}</span>
                  <Tag tone={e.error ? "bad" : "info"}>{e.error ? "rejected" : "waiting"}</Tag>
                </div>
                <div className="text-xs text-white/40">
                  queued {new Date(e.at).toLocaleString("en-IN")}
                </div>
                {e.error && (
                  <div className="mt-1 text-xs text-[#f47564]">
                    {errorMessage(new Error(e.error))}
                  </div>
                )}
              </div>
              {e.error && (
                <TextButton
                  disabled={!online}
                  onClick={() => retry(e.id).then(() => router.invalidate())}
                >
                  Retry
                </TextButton>
              )}
              <TextButton
                onClick={() =>
                  confirm(`Discard "${e.label}"? It will not be saved.`) && discard(e.id)
                }
              >
                Discard
              </TextButton>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
