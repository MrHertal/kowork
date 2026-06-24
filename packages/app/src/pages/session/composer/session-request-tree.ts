import type {
  PermissionRequest,
  QuestionRequest,
  Session,
} from "@opencode-ai/sdk/v2/client";

function sessionTreeRequest<T>(
  sessions: Session[],
  request: Record<string, T[] | undefined>,
  sessionID: string | undefined,
  include: (item: T) => boolean = () => true,
): T | undefined {
  if (!sessionID) return undefined;

  const childrenMap = new Map<string, string[]>();
  for (const s of sessions) {
    if (!s.parentID) continue;
    const list = childrenMap.get(s.parentID);
    if (list) list.push(s.id);
    else childrenMap.set(s.parentID, [s.id]);
  }

  const seen = new Set([sessionID]);
  const ids = [sessionID];
  for (const id of ids) {
    const children = childrenMap.get(id);
    if (!children) continue;
    for (const child of children) {
      if (seen.has(child)) continue;
      seen.add(child);
      ids.push(child);
    }
  }

  const matchId = ids.find((id) => request[id]?.some(include));
  if (!matchId) return undefined;
  return request[matchId]?.find(include);
}

export function sessionPermissionRequest(
  sessions: Session[],
  request: Record<string, PermissionRequest[] | undefined>,
  sessionID: string | undefined,
  include?: (item: PermissionRequest) => boolean,
): PermissionRequest | undefined {
  return sessionTreeRequest(sessions, request, sessionID, include);
}

export function sessionQuestionRequest(
  sessions: Session[],
  request: Record<string, QuestionRequest[] | undefined>,
  sessionID: string | undefined,
  include?: (item: QuestionRequest) => boolean,
): QuestionRequest | undefined {
  return sessionTreeRequest(sessions, request, sessionID, include);
}
