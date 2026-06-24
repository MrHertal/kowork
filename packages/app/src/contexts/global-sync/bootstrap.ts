// @opencode-ref: opencode/packages/app/src/context/global-sync/bootstrap.ts
import type {
  Config,
  OpencodeClient,
  Path,
  PermissionRequest,
  Project,
  ProviderAuthResponse,
  ProviderListResponse,
  QuestionRequest,
  Session,
  Todo,
} from "@opencode-ai/sdk/v2/client";
import {
  queryOptions,
  skipToken,
  type QueryClient,
} from "@tanstack/react-query";
import { getFilename } from "@/utils/path";
import { retry } from "@/utils/retry";
import { formatServerError } from "@/utils/server-errors";
import { toast } from "sonner";
import { loadSessionsQuery } from "@/contexts/global-sync";
import { skillsQueryOptions } from "@/hooks/use-skills";
import type { State } from "./types";
import { cmp, normalizeAgentList, normalizeProviderList } from "./utils";

type GlobalStore = {
  ready: boolean;
  path: Path;
  project: Project[];
  session_todo: {
    [sessionID: string]: Todo[];
  };
  provider: ProviderListResponse;
  provider_auth: ProviderAuthResponse;
  config: Config;
  reload: undefined | "pending" | "complete";
};

function waitForPaint() {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(finish, 50);
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => {
      setTimeout(() => {
        clearTimeout(timer);
        finish();
      }, 0);
    });
  });
}

function errors(list: PromiseSettledResult<unknown>[]) {
  return list
    .filter((item): item is PromiseRejectedResult => item.status === "rejected")
    .map((item) => item.reason);
}

const providerRev = new Map<string, number>();

export function clearProviderRev(directory: string) {
  providerRev.delete(directory);
}

function runAll(list: Array<() => Promise<unknown>>) {
  return Promise.allSettled(list.map((item) => item()));
}

export async function bootstrapGlobal(input: {
  globalSDK: OpencodeClient;
  setGlobalStore: (fn: (draft: GlobalStore) => void) => void;
  queryClient: QueryClient;
}) {
  const fast = [
    () =>
      retry(() =>
        input.globalSDK.global.config.get().then((x) => {
          input.setGlobalStore((d) => {
            d.config = x.data!;
          });
        }),
      ),
    () =>
      input.queryClient.fetchQuery({
        ...loadProvidersQuery(null),
        queryFn: () =>
          retry(() =>
            input.globalSDK.provider.list().then((x) => {
              input.setGlobalStore((d) => {
                d.provider = normalizeProviderList(x.data!);
              });
              return null;
            }),
          ),
      }),
  ];

  const slow = [
    () =>
      retry(() =>
        input.globalSDK.path.get().then((x) => {
          input.setGlobalStore((d) => {
            d.path = x.data!;
          });
        }),
      ),
    () =>
      retry(() =>
        input.globalSDK.project.list().then((x) => {
          const projects = (x.data ?? [])
            .filter((p) => !!p?.id)
            .filter(
              (p) => !!p.worktree && !p.worktree.includes("opencode-test"),
            )
            .slice()
            .sort((a, b) => cmp(a.id, b.id));
          input.setGlobalStore((d) => {
            d.project = projects;
          });
        }),
      ),
  ];
  await runAll(fast);
  await waitForPaint();
  await runAll(slow);
  input.setGlobalStore((d) => {
    d.ready = true;
  });
}

function groupBySession<T extends { id: string; sessionID: string }>(
  input: T[],
) {
  return input.reduce<Record<string, T[]>>((acc, item) => {
    if (!item?.id || !item.sessionID) return acc;
    const list = acc[item.sessionID];
    if (list) list.push(item);
    if (!list) acc[item.sessionID] = [item];
    return acc;
  }, {});
}

function projectID(directory: string, projects: Project[]) {
  return projects.find(
    (project) =>
      project.worktree === directory || project.sandboxes?.includes(directory),
  )?.id;
}

function mergeSession(
  setState: (fn: (draft: State) => void) => void,
  session: Session,
) {
  setState((draft) => {
    const idx = draft.session.findIndex((item) => item.id >= session.id);
    if (idx === -1) {
      draft.session.push(session);
      return;
    }
    if (draft.session[idx]?.id === session.id) {
      draft.session[idx] = session;
      return;
    }
    draft.session.splice(idx, 0, session);
  });
}

function warmSessions(input: {
  ids: string[];
  getState: () => State;
  setState: (fn: (draft: State) => void) => void;
  sdk: OpencodeClient;
}) {
  const known = new Set(input.getState().session.map((item) => item.id));
  const ids = [...new Set(input.ids)].filter((id) => !!id && !known.has(id));
  if (ids.length === 0) return Promise.resolve();
  return Promise.all(
    ids.map((sessionID) =>
      retry(() => input.sdk.session.get({ sessionID })).then((x) => {
        const session = x.data;
        if (!session?.id) return;
        mergeSession(input.setState, session);
      }),
    ),
  ).then(() => undefined);
}

export const loadProvidersQuery = (directory: string | null) =>
  queryOptions<null>({
    queryKey: [directory, "providers"],
    queryFn: skipToken,
  });

export const loadAgentsQuery = (directory: string | null) =>
  queryOptions<null>({
    queryKey: [directory, "agents"],
    queryFn: skipToken,
  });

export async function bootstrapDirectory(input: {
  directory: string;
  sdk: OpencodeClient;
  getState: () => State;
  setState: (fn: (draft: State) => void) => void;
  loadSessions: (directory: string) => Promise<void> | void;
  translate: (key: string, vars?: Record<string, string | number>) => string;
  global: {
    config: Config;
    path: Path;
    project: Project[];
    provider: ProviderListResponse;
  };
  queryClient: QueryClient;
}) {
  const loading = input.getState().status !== "complete";
  const seededProject = projectID(input.directory, input.global.project);
  const seededPath =
    input.global.path.directory === input.directory
      ? input.global.path
      : undefined;
  if (seededProject)
    input.setState((d) => {
      d.project = seededProject;
    });
  if (seededPath)
    input.setState((d) => {
      d.path = seededPath;
    });
  if (
    input.getState().provider.all.length === 0 &&
    input.global.provider.all.length > 0
  ) {
    input.setState((d) => {
      d.provider = input.global.provider;
    });
  }
  if (
    Object.keys(input.getState().config).length === 0 &&
    Object.keys(input.global.config).length > 0
  ) {
    input.setState((d) => {
      d.config = input.global.config;
    });
  }
  if (loading || input.getState().provider.all.length === 0) {
    input.setState((d) => {
      d.provider_ready = false;
    });
  }
  if (loading)
    input.setState((d) => {
      d.status = "partial";
    });

  const fast = [() => Promise.resolve(input.loadSessions(input.directory))];

  const errs = errors(await runAll(fast));
  if (errs.length > 0) {
    console.error("Failed to bootstrap instance", errs[0]);
    const project = getFilename(input.directory);
    toast.error(
      input.translate("toast.project.reloadFailed.title", { project }),
      { description: formatServerError(errs[0], input.translate) },
    );
  }

  (async () => {
    const slow = [
      () =>
        input.queryClient.ensureQueryData({
          ...loadAgentsQuery(input.directory),
          queryFn: () =>
            retry(() =>
              input.sdk.app.agents().then((x) => {
                input.setState((d) => {
                  d.agent = normalizeAgentList(x.data);
                });
              }),
            ).then(() => null),
        }),
      () =>
        input.queryClient.prefetchQuery(
          skillsQueryOptions(input.directory, input.sdk),
        ),
      () =>
        retry(() =>
          input.sdk.config.get().then((x) => {
            input.setState((d) => {
              d.config = x.data!;
            });
          }),
        ),
      () =>
        retry(() =>
          input.sdk.session.status().then((x) => {
            input.setState((d) => {
              d.session_status = x.data!;
            });
          }),
        ),
      () =>
        seededProject
          ? Promise.resolve()
          : retry(() => input.sdk.project.current()).then((x) => {
              input.setState((d) => {
                d.project = x.data!.id;
              });
            }),
      () =>
        seededPath
          ? Promise.resolve()
          : retry(() =>
              input.sdk.path.get().then((x) => {
                input.setState((d) => {
                  d.path = x.data!;
                  const next = projectID(
                    x.data?.directory ?? input.directory,
                    input.global.project,
                  );
                  if (next) d.project = next;
                });
              }),
            ),
      () =>
        retry(() =>
          input.sdk.vcs.get().then((x) => {
            input.setState((d) => {
              d.vcs = x.data ?? d.vcs;
            });
          }),
        ),
      () =>
        retry(() =>
          input.sdk.command.list().then((x) => {
            input.setState((d) => {
              d.command = x.data ?? [];
            });
          }),
        ),
      () =>
        retry(() =>
          input.sdk.permission.list().then((x) => {
            const ids = (x.data ?? [])
              .map((perm) => perm?.sessionID)
              .filter((id): id is string => !!id);
            const grouped = groupBySession(
              (x.data ?? []).filter(
                (perm): perm is PermissionRequest =>
                  !!perm?.id && !!perm.sessionID,
              ),
            );
            return warmSessions({
              ids,
              getState: input.getState,
              setState: input.setState,
              sdk: input.sdk,
            }).then(() => {
              input.setState((draft) => {
                for (const sessionID of Object.keys(draft.permission)) {
                  if (grouped[sessionID]) continue;
                  draft.permission[sessionID] = [];
                }
                for (const [sessionID, permissions] of Object.entries(
                  grouped,
                )) {
                  draft.permission[sessionID] = permissions
                    .filter((p) => !!p?.id)
                    .sort((a, b) => cmp(a.id, b.id));
                }
              });
            });
          }),
        ),
      () =>
        retry(() =>
          input.sdk.question.list().then((x) => {
            const ids = (x.data ?? [])
              .map((question) => question?.sessionID)
              .filter((id): id is string => !!id);
            const grouped = groupBySession(
              (x.data ?? []).filter(
                (q): q is QuestionRequest => !!q?.id && !!q.sessionID,
              ),
            );
            return warmSessions({
              ids,
              getState: input.getState,
              setState: input.setState,
              sdk: input.sdk,
            }).then(() => {
              input.setState((draft) => {
                for (const sessionID of Object.keys(draft.question)) {
                  if (grouped[sessionID]) continue;
                  draft.question[sessionID] = [];
                }
                for (const [sessionID, questions] of Object.entries(grouped)) {
                  draft.question[sessionID] = questions
                    .filter((q) => !!q?.id)
                    .sort((a, b) => cmp(a.id, b.id));
                }
              });
            });
          }),
        ),
      () => Promise.resolve(input.loadSessions(input.directory)),
      () =>
        retry(() =>
          input.sdk.mcp.status().then((x) => {
            input.setState((d) => {
              d.mcp = x.data!;
              d.mcp_ready = true;
            });
          }),
        ),
    ];

    await waitForPaint();
    const slowErrs = errors(await runAll(slow));
    if (slowErrs.length > 0) {
      console.error("Failed to finish bootstrap instance", slowErrs[0]);
      const project = getFilename(input.directory);
      toast.error(
        input.translate("toast.project.reloadFailed.title", { project }),
        { description: formatServerError(slowErrs[0], input.translate) },
      );
    }

    if (loading && errs.length === 0 && slowErrs.length === 0) {
      input.setState((d) => {
        d.status = "complete";
      });
    }

    const rev = (providerRev.get(input.directory) ?? 0) + 1;
    providerRev.set(input.directory, rev);
    void input.queryClient.ensureQueryData({
      ...loadSessionsQuery(input.directory),
      queryFn: () =>
        retry(() => input.sdk.provider.list())
          .then((x) => {
            if (providerRev.get(input.directory) !== rev) return;
            input.setState((d) => {
              d.provider = normalizeProviderList(x.data!);
              d.provider_ready = true;
            });
          })
          .catch((err) => {
            if (providerRev.get(input.directory) !== rev) {
              console.error("Failed to refresh provider list", err);
            }
            const project = getFilename(input.directory);
            toast.error(
              input.translate("toast.project.reloadFailed.title", { project }),
              { description: formatServerError(err, input.translate) },
            );
          })
          .then(() => null),
    });
  })();
}
