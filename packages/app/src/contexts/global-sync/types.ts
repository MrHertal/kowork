// @opencode-ref: opencode/packages/app/src/context/global-sync/types.ts
import type {
  Agent,
  Command,
  Config,
  LspStatus,
  McpStatus,
  Message,
  Part,
  Path,
  PermissionRequest,
  ProviderListResponse,
  QuestionRequest,
  Session,
  SessionStatus,
  SnapshotFileDiff,
  Todo,
  VcsInfo,
} from "@opencode-ai/sdk/v2/client";

export type ProjectMeta = {
  name?: string;
  icon?: {
    override?: string;
    color?: string;
  };
  commands?: {
    start?: string;
  };
};

export type State = {
  status: "loading" | "partial" | "complete";
  agent: Agent[];
  command: Command[];
  project: string;
  projectMeta: ProjectMeta | undefined;
  icon: string | undefined;
  provider_ready: boolean;
  provider: ProviderListResponse;
  config: Config;
  path: Path;
  session: Session[];
  sessionTotal: number;
  session_status: {
    [sessionID: string]: SessionStatus;
  };
  session_diff: {
    [sessionID: string]: SnapshotFileDiff[];
  };
  todo: {
    [sessionID: string]: Todo[];
  };
  permission: {
    [sessionID: string]: PermissionRequest[];
  };
  question: {
    [sessionID: string]: QuestionRequest[];
  };
  mcp_ready: boolean;
  mcp: {
    [name: string]: McpStatus;
  };
  lsp_ready: boolean;
  lsp: LspStatus[];
  vcs: VcsInfo | undefined;
  limit: number;
  message: {
    [sessionID: string]: Message[];
  };
  message_loading: {
    [key: string]: boolean;
  };
  part: {
    [messageID: string]: Part[];
  };
};

export type RootLoadArgs = {
  directory: string;
  limit: number;
  list: (query: {
    directory: string;
    roots: true;
    limit?: number;
  }) => Promise<{ data?: Session[]; error?: unknown; response: Response }>;
};

export type RootLoadResult = {
  data?: Session[];
  limit: number;
  limited: boolean;
};

export const SESSION_RECENT_WINDOW = 4 * 60 * 60 * 1000;
export const SESSION_RECENT_LIMIT = 50;
