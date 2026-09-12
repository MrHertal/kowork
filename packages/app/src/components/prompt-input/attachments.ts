// @opencode-ref: opencode/packages/app/src/components/prompt-input/attachments.ts

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { usePlatform } from "@/contexts/platform";
import {
  usePrompt,
  type PromptAttachmentPart,
} from "@/contexts/prompt";
import { useServer } from "@/contexts/server";
import { m } from "@/paraglide/messages";
import { createBlobReference } from "@/utils/blob";
import { attachmentMime, pathOnlyAttachmentInfo } from "./files";

const OVERLAY_SELECTOR =
  '[data-slot="dialog-overlay"],[data-slot="alert-dialog-overlay"]';

function hasOpenOverlay() {
  return document.querySelector(OVERLAY_SELECTOR) !== null;
}

function warn() {
  toast.error(m.toast_prompt_attachUnsupported_title(), {
    description: m.toast_prompt_attachUnsupported_description(),
  });
}

function warnLocalAttachmentsUnavailable() {
  toast.error(m.toast_prompt_attachOfficeUnavailable_title(), {
    description: m.toast_prompt_attachOfficeUnavailable_description(),
  });
}

function warnAttachmentPathUnavailable() {
  toast.error(m.toast_prompt_attachOfficePathFailed_title(), {
    description: m.toast_prompt_attachOfficePathFailed_description(),
  });
}

export function usePromptAttachments() {
  const { update } = usePrompt();
  const platform = usePlatform();
  const server = useServer();
  const sidecar =
    server.current?.type === "sidecar" ? server.current : undefined;
  const canResolveLocalPaths = !!platform.getPathForFile && !!sidecar;

  const add = useCallback(
    async (
      file: File,
      allowPathOnlyFiles: boolean,
    ): Promise<
      "added" | "unsupported" | "local-unavailable" | "path-unavailable"
    > => {
      const local = pathOnlyAttachmentInfo(file);
      if (local) {
        if (!allowPathOnlyFiles) return "path-unavailable";
        if (!platform.getPathForFile || !sidecar) return "local-unavailable";
        const path = await platform.getPathForFile(file, {
          target: sidecar.variant === "wsl" ? "wsl" : "native",
          wslDistro: sidecar.variant === "wsl" ? sidecar.distro : undefined,
        });
        if (!path) return "path-unavailable";
        const attachment: PromptAttachmentPart = {
          type: "attachment",
          id: nanoid(),
          filename: file.name,
          mime: local.mime,
          local: {
            path,
            format: local.format,
            serverKey: server.key,
          },
        };
        update((prev) => [...prev, attachment]);
        return "added";
      }

      const mime = await attachmentMime(file);
      if (!mime) return "unsupported";

      // Best-effort local representation for PDF tools.
      const pdfPath =
        mime === "application/pdf" && platform.getPathForFile && sidecar
          ? await platform.getPathForFile(file, {
              target: sidecar.variant === "wsl" ? "wsl" : "native",
              wslDistro: sidecar.variant === "wsl" ? sidecar.distro : undefined,
            })
          : null;
      const attachment: PromptAttachmentPart = {
        type: "attachment",
        id: nanoid(),
        filename: file.name,
        mime,
        blob: await createBlobReference(file),
        ...(pdfPath
          ? {
              local: {
                path: pdfPath,
                format: "pdf" as const,
                serverKey: server.key,
              },
            }
          : {}),
      };
      update((prev) => [...prev, attachment]);
      return "added";
    },
    [platform, server.key, sidecar, update],
  );

  const addAttachment = useCallback(
    async (file: File): Promise<boolean> => {
      const result = await add(file, false);
      if (result === "unsupported") warn();
      if (result === "local-unavailable") warnLocalAttachmentsUnavailable();
      if (result === "path-unavailable") warnAttachmentPathUnavailable();
      return result === "added";
    },
    [add],
  );

  const addAttachments = useCallback(
    async (
      files: File[],
      showToast = true,
      allowPathOnlyFiles = true,
    ): Promise<boolean> => {
      let found = false;
      let localUnavailable = false;
      let pathUnavailable = false;
      for (const file of files) {
        const result = await add(file, allowPathOnlyFiles);
        if (result === "added") found = true;
        if (result === "local-unavailable") localUnavailable = true;
        if (result === "path-unavailable") pathUnavailable = true;
      }
      if (showToast && pathUnavailable) warnAttachmentPathUnavailable();
      else if (showToast && localUnavailable)
        warnLocalAttachmentsUnavailable();
      else if (!found && files.length > 0 && showToast) warn();
      return found;
    },
    [add],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      update((prev) =>
        prev.filter(
          (part) =>
            part.type !== "attachment" || part.id !== id,
        ),
      );
    },
    [update],
  );

  const handlePaste = useCallback(
    async (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      const files = Array.from(clipboardData.items).flatMap((item) => {
        if (item.kind !== "file") return [];
        const file = item.getAsFile();
        return file ? [file] : [];
      });

      if (files.length > 0) {
        event.preventDefault();
        await addAttachments(files, true, false);
        return;
      }

      // Desktop: Browser clipboard has no images and no text, try platform's native clipboard for images
      if (platform.readClipboardImage && !clipboardData.getData("text/plain")) {
        event.preventDefault();
        const file = await platform.readClipboardImage();
        if (file) await addAttachment(file);
      }
    },
    [addAttachment, addAttachments, platform],
  );

  return {
    addAttachment,
    addAttachments,
    canResolveLocalPaths,
    removeAttachment,
    handlePaste,
  };
}

export function useGlobalAttachmentDrop() {
  const { addAttachments } = usePromptAttachments();
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    // Capture phase + stopPropagation, so AI Elements' form-level drop
    // listener can't double-process into its own attachment state.
    const handleDragOver = (event: DragEvent) => {
      if (hasOpenOverlay()) return;
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      event.stopPropagation();
      setIsDragging(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (hasOpenOverlay()) return;
      // null relatedTarget = drag left the window (not just an inner element).
      if (!event.relatedTarget) setIsDragging(false);
    };

    const handleDrop = (event: DragEvent) => {
      if (hasOpenOverlay()) return;
      setIsDragging(false);
      const files = event.dataTransfer?.files;
      if (!files || files.length === 0) return;
      event.preventDefault();
      event.stopPropagation();
      void addAttachments(Array.from(files));
    };

    document.addEventListener("dragover", handleDragOver, { capture: true });
    document.addEventListener("dragleave", handleDragLeave);
    document.addEventListener("drop", handleDrop, { capture: true });
    return () => {
      document.removeEventListener("dragover", handleDragOver, {
        capture: true,
      });
      document.removeEventListener("dragleave", handleDragLeave);
      document.removeEventListener("drop", handleDrop, { capture: true });
    };
  }, [addAttachments]);

  return { isDragging };
}
