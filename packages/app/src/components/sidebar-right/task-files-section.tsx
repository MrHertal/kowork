import {
  ChevronDownIcon,
  FileIcon,
  FileImageIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  PresentationIcon,
  type LucideIcon,
} from "lucide-react";
import { useId } from "react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { m } from "@/paraglide/messages";
import { getFileExtension, getFilename } from "@/utils/path";
import type { TaskFile } from "@/utils/session-files";

const spreadsheetExtensions = new Set(["csv", "xls", "xlsx"]);
const presentationExtensions = new Set(["key", "ppt", "pptx"]);
const imageExtensions = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "svg",
  "webp",
]);
const documentExtensions = new Set(["doc", "docx", "md", "odt", "rtf", "txt"]);
const fileDisplayLimit = 20;

function fileIcon(path: string): LucideIcon {
  const extension = (getFileExtension(path) ?? "").toLowerCase();
  if (spreadsheetExtensions.has(extension)) return FileSpreadsheetIcon;
  if (presentationExtensions.has(extension)) return PresentationIcon;
  if (imageExtensions.has(extension)) return FileImageIcon;
  if (documentExtensions.has(extension)) return FileTextIcon;
  return FileIcon;
}

export function TaskFilesSection({ files }: { files: TaskFile[] }) {
  const headingID = useId();
  const countID = useId();
  const countLabel =
    files.length === 1
      ? m.sessionInfo_fileCount_one({ count: files.length })
      : m.sessionInfo_fileCount_other({ count: files.length });
  const visibleFiles = files.slice(0, fileDisplayLimit);
  const remaining = files.length - visibleFiles.length;
  const large = remaining > 0;

  return (
    <SidebarGroup>
      <SidebarGroupLabel asChild>
        <h3 id={headingID}>{m.sessionInfo_filesChanged()}</h3>
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <Collapsible defaultOpen>
          <CollapsibleTrigger
            aria-labelledby={`${headingID} ${countID}`}
            className="group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent"
          >
            <span className="flex items-center gap-2">
              <ChevronDownIcon
                className="size-4 shrink-0 transition-transform group-data-[state=closed]:-rotate-90"
                aria-hidden="true"
              />
              <span id={countID}>{countLabel}</span>
            </span>
            {large && (
              <span className="text-xs font-normal tabular-nums">
                {visibleFiles.length}/{files.length}
              </span>
            )}
          </CollapsibleTrigger>
          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
            <ul className="mt-1">
              {visibleFiles.map((file) => {
                const Icon = fileIcon(file.path);

                return (
                  <li
                    key={file.path}
                    className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-1.5"
                  >
                    <Icon
                      className="size-4 shrink-0 text-sidebar-foreground/60"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1 text-sm break-words text-sidebar-foreground">
                      {getFilename(file.path)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
