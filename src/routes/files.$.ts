import { createFileRoute } from "@tanstack/react-router";
import { serveFile } from "#/server/files.server";

// R2 objects (photos, ID proofs, receipts). Auth is enforced by the gate in src/server.ts.
export const Route = createFileRoute("/files/$")({
  server: {
    handlers: {
      GET: ({ params }) => serveFile(params._splat ?? ""),
    },
  },
});
