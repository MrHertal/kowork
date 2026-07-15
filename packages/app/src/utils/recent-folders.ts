type RecentFolderProject = {
  worktree: string;
};

type RecentFolderSession = {
  directory: string;
  time: {
    created: number;
    updated?: number;
    archived?: number;
  };
};

export function getRecentFolders(
  projects: readonly RecentFolderProject[],
  sessions: readonly RecentFolderSession[],
  limit = 5,
) {
  const activityByDirectory = new Map<string, number>();

  for (const session of sessions) {
    if (session.time.archived) continue;
    const activity = session.time.updated ?? session.time.created;
    const current = activityByDirectory.get(session.directory) ?? 0;
    if (activity > current) {
      activityByDirectory.set(session.directory, activity);
    }
  }

  return projects
    .map((project, index) => ({
      directory: project.worktree,
      activity: activityByDirectory.get(project.worktree) ?? 0,
      index,
    }))
    .sort((a, b) => b.activity - a.activity || a.index - b.index)
    .slice(0, limit)
    .map((item) => item.directory);
}
