import { useRef } from "react";
import { deleteFile, uploadFile } from "#/fns/write.functions";
import type { FileRow } from "#/server/schema.server";
import { useOnline } from "#/lib/outbox";
import { Button, Empty, ErrorText, TextButton, useAction } from "./pop";

/** Downscale photos before upload (native canvas): phone shots go from ~4 MB to ~300 KB. */
async function shrink(file: File, max = 1600): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
  return new File([blob], file.name.replace(/\.\w+$/, "") + ".webp", { type: "image/webp" });
}

export function Files({
  ownerType,
  ownerId,
  files,
  label = "Add file",
}: {
  ownerType: FileRow["ownerType"];
  ownerId: string;
  files: FileRow[];
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const online = useOnline();
  const { busy, error, run } = useAction();

  async function onPick(list: FileList | null) {
    if (!list?.length) return;
    await run(async () => {
      for (const f of Array.from(list)) {
        const form = new FormData();
        form.set("ownerType", ownerType);
        form.set("ownerId", ownerId);
        form.set("file", await shrink(f));
        await uploadFile({ data: form });
      }
    });
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      {files.length === 0 ? (
        <Empty>No files yet</Empty>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {files.map((f) => (
            <li key={f.id} className="border border-line bg-surface">
              <a
                href={`/files/${f.key}`}
                target="_blank"
                rel="noreferrer"
                className="block aspect-square overflow-hidden"
              >
                {f.contentType.startsWith("image/") ? (
                  <img
                    src={`/files/${f.key}`}
                    alt={f.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <span className="caps flex size-full items-center justify-center text-white/50">
                    PDF
                  </span>
                )}
              </a>
              <div className="flex items-center justify-between gap-2 p-2">
                <span className="truncate text-xs text-white/70" title={f.name}>
                  {f.name}
                </span>
                <TextButton
                  disabled={!online || busy}
                  onClick={() =>
                    confirm(`Delete ${f.name}?`) && run(() => deleteFile({ data: { id: f.id } }))
                  }
                  className="text-[11px]"
                >
                  Delete
                </TextButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        hidden
        onChange={(e) => onPick(e.currentTarget.files)}
      />
      <Button
        tone="dark"
        size="sm"
        className="mt-4"
        disabled={!online || busy}
        onClick={() => input.current?.click()}
      >
        {busy ? "Uploading…" : online ? label : "Uploads need a connection"}
      </Button>
      <ErrorText error={error} />
    </div>
  );
}
