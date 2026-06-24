import { ListChecksIcon } from "lucide-react";

import {
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
} from "@/components/ai-elements/queue";

import { m } from "@/paraglide/messages";

import { BasicTool, type ToolProps } from "./basic-tool";

interface Todo {
  content: string;
  status: "completed" | "pending";
}

const EMPTY_TODOS: Todo[] = [];

function getTodos(props: ToolProps): Todo[] {
  const meta = props.metadata?.todos;
  if (Array.isArray(meta)) return meta as Todo[];
  const input = props.input.todos;
  if (Array.isArray(input)) return input as Todo[];
  return EMPTY_TODOS;
}

export function TodoWriteTool(props: ToolProps) {
  const todos = getTodos(props);
  const completed = todos.filter((t) => t.status === "completed").length;
  const subtitle =
    todos.length > 0 ? `${completed}/${todos.length}` : undefined;

  return (
    <BasicTool
      icon={<ListChecksIcon />}
      title={m.session_tool_todos()}
      subtitle={subtitle}
      status={props.status}
      defaultOpen
    >
      {todos.length > 0 && (
        <QueueList className="mt-0 mb-0">
          {todos.map((todo, i) => (
            <QueueItem key={i}>
              <div className="flex items-center gap-2">
                <QueueItemIndicator completed={todo.status === "completed"} />
                <QueueItemContent completed={todo.status === "completed"}>
                  {todo.content}
                </QueueItemContent>
              </div>
            </QueueItem>
          ))}
        </QueueList>
      )}
    </BasicTool>
  );
}
