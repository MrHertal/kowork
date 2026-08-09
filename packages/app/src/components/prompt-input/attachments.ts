// @opencode-ref: opencode/packages/app/src/components/prompt-input/attachments.ts

import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { toast } from "sonner";
import { usePlatform } from "@/contexts/platform";
import { usePrompt, type ImageAttachmentPart } from "@/contexts/prompt";
import { m } from "@/paraglide/messages";
import { dataUrl } from "./data-url";
import { attachmentMime } from "./files";

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

function warnRead() {
  toast.error(m.toast_prompt_attachFailed_title(), {
    description: m.toast_prompt_attachFailed_description(),
  });
}

export function usePromptAttachments() {
  const { update } = usePrompt();
  const platform = usePlatform();

  const add = useCallback(
    async (file: File): Promise<"added" | "unsupported" | "unreadable"> => {
      const mime = await attachmentMime(file);
      if (!mime) return "unsupported";

      const url = await dataUrl(file, mime);
      if (!url) return "unreadable";

      const attachment: ImageAttachmentPart = {
        type: "image",
        id: nanoid(),
        filename: file.name,
        mime,
        dataUrl: url,
      };
      update((prev) => [...prev, attachment]);
      return "added";
    },
    [update],
  );

  const addAttachment = useCallback(
    async (file: File): Promise<boolean> => {
      const result = await add(file);
      if (result === "unsupported") warn();
      if (result === "unreadable") warnRead();
      return result === "added";
    },
    [add],
  );

  const addAttachments = useCallback(
    async (files: File[], showToast = true): Promise<boolean> => {
      let found = false;
      let unreadableOnly = files.length > 0;
      for (const file of files) {
        const result = await add(file);
        if (result === "added") found = true;
        if (result === "unsupported") unreadableOnly = false;
      }
      if (!found && files.length > 0 && showToast) {
        (unreadableOnly ? warnRead : warn)();
      }
      return found;
    },
    [add],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      update((prev) =>
        prev.filter((part) => part.type !== "image" || part.id !== id),
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
        await addAttachments(files);
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

  return { addAttachment, addAttachments, removeAttachment, handlePaste };
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
