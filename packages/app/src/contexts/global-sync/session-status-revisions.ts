export type SessionStatusRevisions = ReturnType<
  typeof createSessionStatusRevisions
>;

export function createSessionStatusRevisions() {
  let revision = 0;
  const sessions = new Map<string, number>();

  return {
    checkpoint: () => revision,
    changedSince(sessionID: string, checkpoint: number) {
      return (sessions.get(sessionID) ?? 0) > checkpoint;
    },
    touch(sessionID: string) {
      sessions.set(sessionID, ++revision);
    },
  };
}
