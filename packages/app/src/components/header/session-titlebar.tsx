import { TitlebarSlot } from "@/components/titlebar";
import { TaskDetailsSidebar } from "@/components/sidebar-right/task-details-sidebar";

import {
  SessionActions,
  SessionTitle,
  useSessionHeader,
} from "./session-header-content";

export function SessionTitlebar({ sessionId }: { sessionId: string }) {
  const model = useSessionHeader(sessionId);

  return (
    <>
      <TitlebarSlot name="center">
        <SessionTitle title={model.title} parentID={model.parentID} />
        {!model.parentID && <SessionActions {...model} />}
      </TitlebarSlot>
      <TaskDetailsSidebar title={model.title} />
    </>
  );
}
