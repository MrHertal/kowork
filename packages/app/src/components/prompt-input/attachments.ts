// @opencode-ref: opencode/packages/app/src/components/prompt-input/attachments.ts

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { usePlatform } from "@/contexts/platform";
import {
  usePrompt,
  type ImageAttachmentPart,
  type OfficeAttachmentPart,
} from "@/contexts/prompt";
import { useServer } from "@/contexts/server";
import { m } from "@/paraglide/messages";
import { createBlobReference } from "@/utils/blob";
import { attachmentMime, officeAttachmentInfo } from "./files";

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

function warnOfficeLocal() {
  toast.error(m.toast_prompt_attachOfficeUnavailable_title(), {
    description: m.toast_prompt_attachOfficeUnavailable_description(),
  });
}

function warnOfficePath() {
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
  const canAttachOffice = !!platform.getPathForFile && !!sidecar;

  const add = useCallback(
    async (
      file: File,
      allowOffice: boolean,
    ): Promise<"added" | "unsupported" | "office-unavailable" | "office-path"> => {
      const office = officeAttachmentInfo(file);
      if (office) {
        if (!allowOffice) return "office-path";
        if (!platform.getPathForFile || !sidecar) return "office-unavailable";
        const path = await platform.getPathForFile(file, {
          target: sidecar.variant === "wsl" ? "wsl" : "native",
          wslDistro: sidecar.variant === "wsl" ? sidecar.distro : undefined,
        });
        if (!path) return "office-path";
        const attachment: OfficeAttachmentPart = {
          type: "office",
          id: nanoid(),
          filename: file.name,
          path,
          serverKey: server.key,
          ...office,
        };
        update((prev) => [...prev, attachment]);
        return "added";
      }

      const mime = await attachmentMime(file);
      if (!mime) return "unsupported";

      const attachment: ImageAttachmentPart = {
        type: "image",
        id: nanoid(),
        filename: file.name,
        mime,
        blob: await createBlobReference(file),
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
      if (result === "office-unavailable") warnOfficeLocal();
      if (result === "office-path") warnOfficePath();
      return result === "added";
    },
    [add],
  );

  const addAttachments = useCallback(
    async (
      files: File[],
      showToast = true,
      allowOffice = true,
    ): Promise<boolean> => {
      let found = false;
      let officeUnavailable = false;
      let officePath = false;
      for (const file of files) {
        const result = await add(file, allowOffice);
        if (result === "added") found = true;
        if (result === "office-unavailable") officeUnavailable = true;
        if (result === "office-path") officePath = true;
      }
      if (showToast && officePath) warnOfficePath();
      else if (showToast && officeUnavailable) warnOfficeLocal();
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
            (part.type !== "image" && part.type !== "office") || part.id !== id,
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
    canAttachOffice,
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
