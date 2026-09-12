// @opencode-ref: opencode/packages/app/src/context/prompt.tsx
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
} from "react";
import type { FileSelection } from "@/contexts/file";
import {
  LOCAL_ATTACHMENT_MIMES,
  type LocalAttachmentFormat,
} from "@/constants/file-picker";
import { useSDK } from "@/contexts/sdk";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { type BlobReference, isLiveBlobReference } from "@/utils/blob";
import { Persist } from "@/utils/persist";

interface PartBase {
  content: string;
  start: number;
  end: number;
}

export interface TextPart extends PartBase {
  type: "text";
}

export interface FileAttachmentPart extends PartBase {
  type: "file";
  path: string;
  selection?: FileSelection;
}

export interface PromptAttachmentPart {
  type: "attachment";
  id: string;
  filename: string;
  mime: string;
  blob?: BlobReference;
  local?: {
    path: string;
    format: LocalAttachmentFormat;
    serverKey: string;
  };
}

export type ContentPart = TextPart | FileAttachmentPart | PromptAttachmentPart;
export type Prompt = ContentPart[];

export const DEFAULT_PROMPT: Prompt = [
  { type: "text", content: "", start: 0, end: 0 },
];

function isSelectionEqual(a?: FileSelection, b?: FileSelection): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return (
    a.startLine === b.startLine &&
    a.startChar === b.startChar &&
    a.endLine === b.endLine &&
    a.endChar === b.endChar
  );
}

function isPartEqual(a: ContentPart, b: ContentPart): boolean {
  switch (a.type) {
    case "text":
      return b.type === "text" && a.content === b.content;
    case "file":
      return (
        b.type === "file" &&
        a.path === b.path &&
        isSelectionEqual(a.selection, b.selection)
      );
    case "attachment":
      return b.type === "attachment" && a.id === b.id;
  }
}

export function isPromptEqual(a: Prompt, b: Prompt): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!isPartEqual(a[i]!, b[i]!)) return false;
  }
  return true;
}

function cloneSelection(selection?: FileSelection): FileSelection | undefined {
  if (!selection) return undefined;
  return { ...selection };
}

function clonePart(part: ContentPart): ContentPart {
  if (part.type === "file") {
    return { ...part, selection: cloneSelection(part.selection) };
  }
  return { ...part };
}

function clonePrompt(prompt: Prompt): Prompt {
  return prompt.map(clonePart);
}

type PromptSnapshot = {
  prompt: Prompt;
  cursor?: number;
};

const createDefaultSnapshot = (): PromptSnapshot => ({
  prompt: clonePrompt(DEFAULT_PROMPT),
  cursor: undefined,
});

type LegacyAttachmentPart = {
  type: "image" | "office";
  id: string;
  filename: string;
  mime: string;
  blob?: BlobReference;
  path?: string;
  format?: LocalAttachmentFormat;
  serverKey?: string;
};

function normalizeLocalAttachment(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const local = value as Record<string, unknown>;
  if (typeof local.path !== "string" || typeof local.serverKey !== "string")
    return;
  if (
    typeof local.format !== "string" ||
    !(local.format in LOCAL_ATTACHMENT_MIMES)
  )
    return;
  return {
    path: local.path,
    format: local.format as LocalAttachmentFormat,
    serverKey: local.serverKey,
  };
}

function normalizeAttachment(
  part: PromptAttachmentPart | LegacyAttachmentPart,
): PromptAttachmentPart | undefined {
  const blob =
    part.blob && isLiveBlobReference(part.blob) ? part.blob : undefined;
  const candidateLocal = normalizeLocalAttachment(
    part.type === "attachment"
      ? part.local
      : part.path &&
          part.serverKey &&
          (part.type === "office" || part.mime === "application/pdf")
        ? {
            path: part.path,
            format: part.type === "office" ? part.format : "pdf",
            serverKey: part.serverKey,
          }
        : undefined,
  );
  const local =
    candidateLocal &&
    part.mime === LOCAL_ATTACHMENT_MIMES[candidateLocal.format]
      ? candidateLocal
      : undefined;
  if (!blob && !local) return undefined;
  return {
    type: "attachment",
    id: part.id,
    filename: part.filename,
    mime: part.mime,
    ...(blob ? { blob } : {}),
    ...(local ? { local } : {}),
  };
}

// Blob object URLs die with the document. Preserve a local representation when
// one exists; otherwise restored blob-only attachments are dropped.
const sanitizeSnapshot = (value: PromptSnapshot): PromptSnapshot => {
  const prompt: Prompt = [];
  for (const part of value.prompt as Array<
    ContentPart | LegacyAttachmentPart
  >) {
    if (
      part.type !== "attachment" &&
      part.type !== "image" &&
      part.type !== "office"
    ) {
      prompt.push(part as ContentPart);
      continue;
    }
    const attachment = normalizeAttachment(part);
    if (attachment) prompt.push(attachment);
  }
  return { ...value, prompt };
};

interface PromptContextValue {
  ready: boolean;
  current: Prompt;
  cursor: number | undefined;
  dirty: boolean;
  set: (prompt: Prompt, cursorPosition?: number) => void;
  update: (updater: (prev: Prompt) => Prompt, cursorPosition?: number) => void;
  reset: () => void;
}

const PromptContext = createContext<PromptContextValue | null>(null);

interface PromptProviderProps {
  sessionId?: string;
  children: ReactNode;
}

export function PromptProvider({ sessionId, children }: PromptProviderProps) {
  const sdk = useSDK();

  const persistTarget = useMemo(
    () => Persist.scoped(sdk.directory, sessionId, "prompt"),
    [sdk.directory, sessionId],
  );

  const {
    state: snapshot,
    setState: setSnapshot,
    ready: persistReady,
  } = usePersistedState<PromptSnapshot>({
    target: persistTarget,
    createDefault: createDefaultSnapshot,
    sanitize: sanitizeSnapshot,
    logName: "prompt",
  });

  const current = snapshot.prompt;
  const cursor = snapshot.cursor;
  const dirty = useMemo(
    () => !isPromptEqual(current, DEFAULT_PROMPT),
    [current],
  );

  const set = useCallback(
    (prompt: Prompt, cursorPosition?: number) => {
      const next = clonePrompt(prompt);
      setSnapshot((prev) => ({
        prompt: next,
        cursor: cursorPosition ?? prev.cursor,
      }));
    },
    [setSnapshot],
  );

  const update = useCallback(
    (updater: (prev: Prompt) => Prompt, cursorPosition?: number) => {
      setSnapshot((prev) => ({
        prompt: clonePrompt(updater(prev.prompt)),
        cursor: cursorPosition ?? prev.cursor,
      }));
    },
    [setSnapshot],
  );

  const reset = useCallback(() => {
    setSnapshot({ prompt: clonePrompt(DEFAULT_PROMPT), cursor: 0 });
  }, [setSnapshot]);

  const ctxValue = useMemo<PromptContextValue>(
    () => ({
      ready: persistReady,
      current,
      cursor,
      dirty,
      set,
      update,
      reset,
    }),
    [persistReady, current, cursor, dirty, set, update, reset],
  );

  return (
    <PromptContext.Provider value={ctxValue}>{children}</PromptContext.Provider>
  );
}

export function usePrompt(): PromptContextValue {
  const ctx = useContext(PromptContext);
  if (!ctx) throw new Error("usePrompt must be used within a <PromptProvider>");
  return ctx;
}
