import type { Todo } from "@opencode-ai/sdk/v2/client";

import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "@/components/ai-elements/queue";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

function statusLabel(status: Todo["status"]) {
  switch (status) {
    case "in_progress":
      return m.sessionInfo_stepInProgress();
    case "completed":
      return m.sessionInfo_stepCompleted();
    case "cancelled":
      return m.sessionInfo_stepSkipped();
    default:
      return m.sessionInfo_stepPending();
  }
}

export function TaskProgressSection({ todos }: { todos: Todo[] }) {
  const completed = todos.filter((todo) => todo.status === "completed").length;
  const progress =
    todos.length === 1
      ? m.sessionInfo_stepsComplete_one({ completed, total: todos.length })
      : m.sessionInfo_stepsComplete({ completed, total: todos.length });

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{m.sessionInfo_progress()}</SidebarGroupLabel>
      <SidebarGroupContent>
        <Queue className="rounded-none border-0 bg-transparent p-0 shadow-none">
          <QueueSection>
            <QueueSectionTrigger
              aria-label={progress}
              className="rounded-xl bg-transparent font-normal text-sidebar-foreground ring-sidebar-ring outline-hidden hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent"
            >
              <QueueSectionLabel
                count={todos.length}
                label={
                  todos.length === 1
                    ? m.sessionInfo_step()
                    : m.sessionInfo_steps()
                }
              />
              <span className="text-xs font-normal tabular-nums">
                {completed}/{todos.length}
              </span>
            </QueueSectionTrigger>
            <QueueSectionContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <QueueList className="mt-1 mb-0 [&_.max-h-40]:max-h-none">
                {todos.map((todo, index) => {
                  const completed = todo.status === "completed";
                  const cancelled = todo.status === "cancelled";
                  const active = todo.status === "in_progress";
                  const pending = !completed && !cancelled && !active;

                  return (
                    <QueueItem
                      key={`${todo.content}:${index}`}
                      aria-label={`${statusLabel(todo.status)}: ${todo.content}`}
                      className="rounded-xl py-1.5 hover:bg-sidebar-accent"
                    >
                      <div className="flex items-start gap-2">
                        <QueueItemIndicator
                          completed={completed}
                          aria-hidden="true"
                          className={cn(
                            "mt-1 shrink-0",
                            pending && "border-sidebar-foreground/50",
                            completed &&
                              "border-sidebar-foreground/20 bg-sidebar-foreground/10",
                            active &&
                              "border-sidebar-foreground bg-sidebar-foreground",
                            cancelled &&
                              "border-transparent bg-sidebar-foreground/20",
                          )}
                        />
                        <QueueItemContent
                          completed={completed || cancelled}
                          className={cn(
                            "line-clamp-none",
                            pending && "text-sidebar-foreground/70",
                            (completed || cancelled) &&
                              "text-sidebar-foreground/50",
                            active && "font-medium text-sidebar-foreground",
                          )}
                        >
                          {todo.content}
                        </QueueItemContent>
                      </div>
                    </QueueItem>
                  );
                })}
              </QueueList>
            </QueueSectionContent>
          </QueueSection>
        </Queue>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
