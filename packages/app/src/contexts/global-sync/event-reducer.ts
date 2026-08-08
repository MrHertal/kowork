// @opencode-ref: opencode/packages/app/src/context/global-sync/event-reducer.ts
import type {
  Message,
  Part,
  PermissionRequest,
  Project,
  QuestionRequest,
  Session,
  SessionStatus,
  SnapshotFileDiff,
  Todo,
} from "@opencode-ai/sdk/v2/client";
import { Binary } from "@/utils/binary";
import { diffs as list, message as clean } from "@/utils/diffs";
import { dropSessionCaches } from "./session-cache";
import { trimSessions } from "./session-trim";
import type { State } from "./types";

const SKIP_PARTS = new Set(["step-start", "step-finish"]);

export function applyGlobalEvent(input: {
  event: { type: string; properties?: unknown };
  project: Project[];
  setGlobalProject: (next: Project[] | ((draft: Project[]) => void)) => void;
  refresh: () => void;
}) {
  if (
    input.event.type === "global.disposed" ||
    input.event.type === "server.connected"
  ) {
    input.refresh();
    return;
  }

  if (input.event.type !== "project.updated") return;
  const properties = input.event.properties as Project;
  const result = Binary.search(input.project, properties.id, (s) => s.id);
  if (result.found) {
    input.setGlobalProject((draft) => {
      draft[result.index] = { ...draft[result.index], ...properties };
    });
    return;
  }
  input.setGlobalProject((draft) => {
    draft.splice(result.index, 0, properties);
  });
}

function cleanupSessionCaches(draft: State, sessionID: string) {
  if (!sessionID) return;
  dropSessionCaches(draft, [sessionID]);
}

export function cleanupDroppedSessionCaches(draft: State, next: Session[]) {
  const keep = new Set(next.map((item) => item.id));
  const stale = [
    ...Object.keys(draft.message),
    ...Object.keys(draft.session_diff),
    ...Object.keys(draft.todo),
    ...Object.keys(draft.permission),
    ...Object.keys(draft.question),
    ...Object.keys(draft.session_status),
    ...Object.values(draft.part)
      .map((parts) => parts?.find((part) => !!part?.sessionID)?.sessionID)
      .filter((sessionID): sessionID is string => !!sessionID),
  ].filter(
    (sessionID, index, list) =>
      !keep.has(sessionID) && list.indexOf(sessionID) === index,
  );
  if (stale.length === 0) return;
  dropSessionCaches(draft, stale);
  for (const key of Object.keys(draft.message_loading)) {
    const sessionID = key.split("\n")[1];
    if (sessionID && !keep.has(sessionID)) {
      delete draft.message_loading[key];
    }
  }
}

export function applyDirectoryEvent(input: {
  event: { type: string; properties?: unknown };
  getState: () => State;
  setState: (fn: (draft: State) => void) => void;
  push: (directory: string) => void;
  directory: string;
  loadLsp: () => void;
}) {
  const event = input.event;
  switch (event.type) {
    case "server.instance.disposed": {
      input.push(input.directory);
      return;
    }
    case "session.created": {
      const info = (event.properties as { info: Session }).info;
      input.setState((draft) => {
        const result = Binary.search(draft.session, info.id, (s) => s.id);
        if (result.found) {
          draft.session[result.index] = info;
          return;
        }
        draft.session.splice(result.index, 0, info);
        const trimmed = trimSessions(draft.session, {
          limit: draft.limit,
          permission: draft.permission,
          protect: Object.keys(draft.message),
        });
        draft.session = trimmed;
        cleanupDroppedSessionCaches(draft, trimmed);
        if (!info.parentID) draft.sessionTotal += 1;
      });
      break;
    }
    case "session.updated": {
      const info = (event.properties as { info: Session }).info;
      input.setState((draft) => {
        const result = Binary.search(draft.session, info.id, (s) => s.id);
        if (info.time.archived) {
          if (result.found) {
            draft.session.splice(result.index, 1);
          }
          cleanupSessionCaches(draft, info.id);
          if (!info.parentID) {
            draft.sessionTotal = Math.max(0, draft.sessionTotal - 1);
          }
          return;
        }
        if (result.found) {
          draft.session[result.index] = info;
          return;
        }
        draft.session.splice(result.index, 0, info);
        const trimmed = trimSessions(draft.session, {
          limit: draft.limit,
          permission: draft.permission,
          protect: Object.keys(draft.message),
        });
        draft.session = trimmed;
        cleanupDroppedSessionCaches(draft, trimmed);
      });
      break;
    }
    case "session.deleted": {
      const info = (event.properties as { info: Session }).info;
      input.setState((draft) => {
        const result = Binary.search(draft.session, info.id, (s) => s.id);
        if (result.found) {
          draft.session.splice(result.index, 1);
        }
        cleanupSessionCaches(draft, info.id);
        if (!info.parentID) {
          draft.sessionTotal = Math.max(0, draft.sessionTotal - 1);
        }
      });
      break;
    }
    case "session.diff": {
      const props = event.properties as {
        sessionID: string;
        diff: SnapshotFileDiff[];
      };
      input.setState((draft) => {
        draft.session_diff[props.sessionID] = list(props.diff);
      });
      break;
    }
    case "todo.updated": {
      const props = event.properties as {
        sessionID: string;
        todos: Todo[];
      };
      input.setState((draft) => {
        draft.todo[props.sessionID] = props.todos;
      });
      break;
    }
    case "session.status": {
      const props = event.properties as {
        sessionID: string;
        status: SessionStatus;
      };
      input.setState((draft) => {
        draft.session_status[props.sessionID] = props.status;
      });
      break;
    }
    case "message.updated": {
      const info = clean((event.properties as { info: Message }).info);
      input.setState((draft) => {
        const messages = draft.message[info.sessionID];
        if (!messages) {
          draft.message[info.sessionID] = [info];
          return;
        }
        const result = Binary.search(messages, info.id, (m) => m.id);
        if (result.found) {
          messages[result.index] = info;
          return;
        }
        messages.splice(result.index, 0, info);
      });
      break;
    }
    case "message.removed": {
      const props = event.properties as {
        sessionID: string;
        messageID: string;
      };
      input.setState((draft) => {
        const messages = draft.message[props.sessionID];
        if (messages) {
          const result = Binary.search(messages, props.messageID, (m) => m.id);
          if (result.found) messages.splice(result.index, 1);
        }
        delete draft.part[props.messageID];
      });
      break;
    }
    case "message.part.updated": {
      const part = (event.properties as { part: Part }).part;
      if (SKIP_PARTS.has(part.type)) break;
      input.setState((draft) => {
        const parts = draft.part[part.messageID];
        if (!parts) {
          draft.part[part.messageID] = [part];
          return;
        }
        const result = Binary.search(parts, part.id, (p) => p.id);
        if (result.found) {
          parts[result.index] = part;
          return;
        }
        parts.splice(result.index, 0, part);
      });
      break;
    }
    case "message.part.removed": {
      const props = event.properties as {
        messageID: string;
        partID: string;
      };
      input.setState((draft) => {
        const parts = draft.part[props.messageID];
        if (!parts) return;
        const result = Binary.search(parts, props.partID, (p) => p.id);
        if (!result.found) return;
        parts.splice(result.index, 1);
        if (parts.length === 0) delete draft.part[props.messageID];
      });
      break;
    }
    case "message.part.delta": {
      const props = event.properties as {
        messageID: string;
        partID: string;
        field: string;
        delta: string;
      };
      input.setState((draft) => {
        const parts = draft.part[props.messageID];
        if (!parts) return;
        const result = Binary.search(parts, props.partID, (p) => p.id);
        if (!result.found) return;
        const part = parts[result.index]!;
        const field = props.field as keyof typeof part;
        const existing = part[field] as string | undefined;
        (part as Record<string, unknown>)[field] =
          (existing ?? "") + props.delta;
      });
      break;
    }
    case "vcs.branch.updated": {
      const props = event.properties as { branch?: string };
      const state = input.getState();
      if (state.vcs?.branch === props.branch) break;
      input.setState((draft) => {
        draft.vcs = { ...draft.vcs, branch: props.branch };
      });
      break;
    }
    case "permission.asked": {
      const permission = event.properties as PermissionRequest;
      input.setState((draft) => {
        const permissions = draft.permission[permission.sessionID];
        if (!permissions) {
          draft.permission[permission.sessionID] = [permission];
          return;
        }
        const result = Binary.search(permissions, permission.id, (p) => p.id);
        if (result.found) {
          permissions[result.index] = permission;
          return;
        }
        permissions.splice(result.index, 0, permission);
      });
      break;
    }
    case "permission.replied": {
      const props = event.properties as {
        sessionID: string;
        requestID: string;
      };
      input.setState((draft) => {
        const permissions = draft.permission[props.sessionID];
        if (!permissions) return;
        const result = Binary.search(permissions, props.requestID, (p) => p.id);
        if (!result.found) return;
        permissions.splice(result.index, 1);
      });
      break;
    }
    case "question.asked": {
      const question = event.properties as QuestionRequest;
      input.setState((draft) => {
        const questions = draft.question[question.sessionID];
        if (!questions) {
          draft.question[question.sessionID] = [question];
          return;
        }
        const result = Binary.search(questions, question.id, (q) => q.id);
        if (result.found) {
          questions[result.index] = question;
          return;
        }
        questions.splice(result.index, 0, question);
      });
      break;
    }
    case "question.replied":
    case "question.rejected": {
      const props = event.properties as {
        sessionID: string;
        requestID: string;
      };
      input.setState((draft) => {
        const questions = draft.question[props.sessionID];
        if (!questions) return;
        const result = Binary.search(questions, props.requestID, (q) => q.id);
        if (!result.found) return;
        questions.splice(result.index, 1);
      });
      break;
    }
    case "lsp.updated": {
      input.loadLsp();
      break;
    }
  }
}
