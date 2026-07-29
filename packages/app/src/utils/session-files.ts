import type {
  Message,
  Part,
  Session,
  SnapshotFileDiff,
  ToolPart,
  UserMessage,
} from "@opencode-ai/sdk/v2/client";

export type TaskFile = {
  path: string;
  status: NonNullable<SnapshotFileDiff["status"]>;
};

type Source = "presented" | "patch" | "tool" | "summary";
type Observation = TaskFile & {
  key: string;
  source: Source;
  changedAt: number;
};
type Candidate = TaskFile & { source: Source; changedAt: number };
type RevertBoundary = Pick<
  NonNullable<Session["revert"]>,
  "messageID" | "partID"
>;

const priority: Record<Source, number> = {
  presented: 0,
  patch: 1,
  tool: 2,
  summary: 3,
};

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(value: string, directory: string) {
  const path = value.replaceAll("\\", "/");
  const root = directory.replaceAll("\\", "/").replace(/\/+$/, "");
  const insensitive = /^[A-Za-z]:/.test(root);
  const comparablePath = insensitive ? path.toLowerCase() : path;
  const comparableRoot = insensitive ? root.toLowerCase() : root;
  const prefix = comparableRoot === "/" ? "/" : `${comparableRoot}/`;

  const normalized = comparablePath.startsWith(prefix)
    ? path.slice(prefix.length)
    : path.replace(/^\.\/+/, "");
  return {
    path: normalized,
    key: insensitive ? normalized.toLowerCase() : normalized,
  };
}

function comparablePath(value: string) {
  const path = value.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[A-Za-z]:/.test(path) ? path.toLowerCase() : path;
}

function toolFileCandidates(part: ToolPart): Candidate[] {
  if (part.state.status !== "completed") return [];
  const changedAt = part.state.time.end;

  if (part.tool === "write" || part.tool === "edit") {
    const path = part.state.input.filePath;
    if (typeof path !== "string" || !path) return [];
    const added = part.tool === "write" && part.state.metadata.exists === false;
    return [
      {
        path,
        status: added ? "added" : "modified",
        source: "tool",
        changedAt,
      },
    ];
  }

  if (part.tool === "present_files") {
    const files = part.state.metadata.files;
    if (!Array.isArray(files)) return [];

    return files.flatMap((file) => {
      if (!object(file)) return [];
      const path = file.path;
      if (typeof path !== "string" || !path.trim()) return [];
      return [
        {
          path,
          status: "modified",
          source: "presented",
          changedAt,
        } satisfies Candidate,
      ];
    });
  }

  if (part.tool !== "apply_patch") return [];
  const files = part.state.metadata.files;
  if (!Array.isArray(files)) return [];

  return files.flatMap((file) => {
    if (!object(file)) return [];
    if (file.type === "move") {
      const source = file.filePath;
      const destination = file.movePath;
      if (
        typeof source !== "string" ||
        !source ||
        typeof destination !== "string" ||
        !destination
      )
        return [];
      return [
        {
          path: source,
          status: "deleted",
          source: "tool",
          changedAt,
        },
        {
          path: destination,
          status: "added",
          source: "tool",
          changedAt,
        },
      ] satisfies Candidate[];
    }

    const path = file.filePath ?? file.relativePath;
    if (typeof path !== "string" || !path) return [];
    const status =
      file.type === "add"
        ? "added"
        : file.type === "delete"
          ? "deleted"
          : "modified";
    return [
      {
        path,
        status,
        source: "tool",
        changedAt,
      } satisfies Candidate,
    ];
  });
}

function toolFiles(part: ToolPart): Candidate[] {
  const files = toolFileCandidates(part);
  if (
    !files.length ||
    part.tool === "present_files" ||
    part.state.status !== "completed"
  )
    return files;

  const values = part.state.metadata.temporaryPaths;
  if (!Array.isArray(values)) return files;
  const temporaryPaths = new Set(
    values.flatMap((value) =>
      typeof value === "string" && value.trim() ? [comparablePath(value)] : [],
    ),
  );
  if (!temporaryPaths.size) return files;
  return files.filter((file) => !temporaryPaths.has(comparablePath(file.path)));
}

function observe(
  files: Map<string, Observation>,
  observation: Candidate,
  directory: string,
) {
  const normalized = normalizePath(observation.path, directory);
  if (!normalized.path) return;
  const current = files.get(normalized.key);
  if (current && priority[current.source] > priority[observation.source])
    return;
  files.set(normalized.key, { ...observation, ...normalized });
}

function projectTurn(input: {
  user: UserMessage;
  assistantIDs: string[];
  partsByMessage: Map<string, Part[]>;
  changedAtByMessage: Map<string, number>;
  directory: string;
  revert?: RevertBoundary;
  active: boolean;
}) {
  const files = new Map<string, Observation>();
  // Presentation proves inclusion, not the operation, so merge it after status evidence.
  const presented: Candidate[] = [];
  const includePresented = (target: Map<string, Observation>) => {
    for (const file of presented) observe(target, file, input.directory);
    return target;
  };
  const partialRevert =
    input.revert?.partID && input.assistantIDs.includes(input.revert.messageID)
      ? input.revert
      : undefined;
  const cutoffPartID = partialRevert?.partID;
  const turnChangedAt = Math.max(
    input.user.time.created,
    ...input.assistantIDs.map(
      (messageID) => input.changedAtByMessage.get(messageID) ?? 0,
    ),
  );
  let hasPatch = false;

  for (const messageID of input.assistantIDs) {
    if (partialRevert && messageID > partialRevert.messageID) continue;
    const messageParts = input.partsByMessage.get(messageID) ?? [];
    const parts =
      cutoffPartID && messageID === partialRevert?.messageID
        ? messageParts.filter((part) => part.id < cutoffPartID)
        : messageParts;
    for (const part of parts) {
      if (part.type === "patch") {
        hasPatch = true;
        for (const path of part.files) {
          observe(
            files,
            {
              path,
              status: "modified",
              source: "patch",
              changedAt:
                input.changedAtByMessage.get(messageID) ?? turnChangedAt,
            },
            input.directory,
          );
        }
        continue;
      }
      if (part.type !== "tool") continue;
      for (const file of toolFiles(part)) {
        if (file.source === "presented") {
          presented.push(file);
          continue;
        }
        observe(files, file, input.directory);
      }
    }
  }

  if (partialRevert) return includePresented(files);

  const summary = input.user.summary;
  if (!summary) return includePresented(files);
  const summaryFiles = new Map<string, Observation>();

  for (const diff of summary.diffs) {
    if (!diff.file) continue;
    const normalized = normalizePath(diff.file, input.directory);
    observe(
      summaryFiles,
      {
        path: diff.file,
        status: diff.status ?? "modified",
        source: "summary",
        changedAt: files.get(normalized.key)?.changedAt ?? turnChangedAt,
      },
      input.directory,
    );
  }

  // An empty summary is authoritative only when a patch proves snapshots were available.
  if (!input.active && (summaryFiles.size > 0 || hasPatch)) {
    return includePresented(summaryFiles);
  }
  for (const file of summaryFiles.values()) {
    observe(files, file, input.directory);
  }

  return includePresented(files);
}

export function projectSessionFiles(input: {
  messages: readonly Message[];
  parts: readonly Part[];
  directory: string;
  revert?: RevertBoundary;
  active?: boolean;
}) {
  const assistantsByParent = new Map<string, string[]>();
  const changedAtByMessage = new Map<string, number>();
  const partsByMessage = new Map<string, Part[]>();

  for (const message of input.messages) {
    if (message.role !== "assistant") continue;
    changedAtByMessage.set(
      message.id,
      message.time.completed ?? message.time.created,
    );
    const current = assistantsByParent.get(message.parentID);
    if (current) current.push(message.id);
    else assistantsByParent.set(message.parentID, [message.id]);
  }

  for (const part of input.parts) {
    const current = partsByMessage.get(part.messageID);
    if (current) current.push(part);
    else partsByMessage.set(part.messageID, [part]);
  }

  const files = new Map<string, Observation>();
  const users = input.messages
    .filter((message): message is UserMessage => message.role === "user")
    .filter((message) => !input.revert || message.id < input.revert.messageID)
    .sort((a, b) => a.id.localeCompare(b.id));
  const activeUserID = input.active ? users.at(-1)?.id : undefined;

  for (const user of users) {
    const turn = projectTurn({
      user,
      assistantIDs: (assistantsByParent.get(user.id) ?? []).sort(),
      partsByMessage,
      changedAtByMessage,
      directory: input.directory,
      revert: input.revert,
      active: user.id === activeUserID,
    });
    for (const file of turn.values()) {
      files.set(file.key, file);
    }
  }

  return [...files.values()]
    .sort((a, b) => b.changedAt - a.changedAt || a.path.localeCompare(b.path))
    .map((file) => ({ path: file.path, status: file.status }));
}
