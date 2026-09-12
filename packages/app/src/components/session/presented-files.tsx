import {
  ExternalLinkIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  PresentationIcon,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { usePlatform } from "@/contexts/platform";
import { useServer } from "@/contexts/server";
import { useDelayedShow } from "@/hooks/use-delayed-show";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

export type PresentedFile = {
  path: string;
  filename: string;
  mime: string;
  size: number;
};

type FileKind = "word" | "excel" | "powerpoint" | "pdf" | "image";

const openSpinnerDelay = 250;
const openSpinnerMinimum = 300;

const icons: Record<FileKind, LucideIcon> = {
  word: FileTextIcon,
  excel: FileSpreadsheetIcon,
  powerpoint: PresentationIcon,
  pdf: FileIcon,
  image: FileImageIcon,
};

const imageTypeLabels: Record<string, string> = {
  avif: "AVIF",
  bmp: "BMP",
  gif: "GIF",
  ico: "ICO",
  jpeg: "JPEG",
  jpg: "JPEG",
  png: "PNG",
  tif: "TIFF",
  tiff: "TIFF",
  webp: "WebP",
};

function fileExtension(filename: string) {
  return filename.split(".").at(-1)?.toLowerCase() ?? "";
}

function fileKind(file: PresentedFile): FileKind {
  const name = file.filename.toLowerCase();
  if (file.mime.startsWith("image/") || fileExtension(name) in imageTypeLabels)
    return "image";
  if (file.mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (file.mime.includes("spreadsheetml") || name.endsWith(".xlsx"))
    return "excel";
  if (file.mime.includes("presentationml") || name.endsWith(".pptx"))
    return "powerpoint";
  return "word";
}

function fileTypeLabel(file: PresentedFile, kind: FileKind): string {
  switch (kind) {
    case "word":
      return m.session_file_type_word();
    case "excel":
      return m.session_file_type_excel();
    case "powerpoint":
      return m.session_file_type_powerpoint();
    case "pdf":
      return m.session_file_type_pdf();
    case "image":
      return imageTypeLabels[fileExtension(file.filename)] ?? file.mime;
  }
}

function PresentedFileCard({
  file,
  canOpen,
  openPath,
}: {
  file: PresentedFile;
  canOpen: boolean;
  openPath?: (path: string) => Promise<void>;
}) {
  const openingRef = useRef(false);
  const [opening, setOpening] = useState(false);
  const showOpening = useDelayedShow(
    opening,
    openSpinnerDelay,
    openSpinnerMinimum,
  );
  const kind = fileKind(file);
  const Icon = icons[kind];

  const handleOpen = async () => {
    if (openingRef.current || !canOpen || !openPath) return;
    openingRef.current = true;
    setOpening(true);
    try {
      await openPath(file.path);
    } catch {
      toast.error(m.session_file_open_failed_title(), {
        description: m.session_file_open_failed_description(),
      });
    } finally {
      openingRef.current = false;
      setOpening(false);
    }
  };

  return (
    <Card size="sm">
      <CardContent className="flex min-w-0 items-center gap-3">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset",
            kind === "word" &&
              "bg-blue-500/10 text-blue-700 ring-blue-500/15 dark:text-blue-300",
            kind === "excel" &&
              "bg-emerald-500/10 text-emerald-700 ring-emerald-500/15 dark:text-emerald-300",
            kind === "powerpoint" &&
              "bg-orange-500/10 text-orange-700 ring-orange-500/15 dark:text-orange-300",
            kind === "pdf" &&
              "bg-red-500/10 text-red-700 ring-red-500/15 dark:text-red-300",
            kind === "image" &&
              "bg-purple-500/10 text-purple-700 ring-purple-500/15 dark:text-purple-300",
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={file.filename}>
            {file.filename}
          </div>
          <div className="text-xs text-muted-foreground">
            {fileTypeLabel(file, kind)}
          </div>
        </div>
        {canOpen && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={showOpening}
            aria-busy={opening || showOpening}
            aria-disabled={opening || showOpening}
            onClick={() => void handleOpen()}
          >
            {showOpening ? (
              <Spinner
                data-icon="inline-start"
                aria-label={m.common_loading()}
              />
            ) : (
              <ExternalLinkIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {m.session_file_open()}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

export function PresentedFiles({ files }: { files: PresentedFile[] }) {
  const platform = usePlatform();
  const server = useServer();
  const canOpen =
    platform.platform === "desktop" &&
    !!platform.openPath &&
    (server.isLocal ||
      (server.current?.type === "sidecar" && server.current.variant === "wsl"));

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-3 pl-1">
      {files.map((file) => (
        <PresentedFileCard
          key={file.path}
          file={file}
          canOpen={canOpen}
          openPath={platform.openPath}
        />
      ))}
    </div>
  );
}
