import { AnimatePresence, motion } from "motion/react";
import type { ReactNode } from "react";

import { useDelayedShow } from "@/hooks/use-delayed-show";
import { cn } from "@/lib/utils";

import type { SessionComposerState } from "./session-composer-state";
import { SessionPermissionDock } from "./session-permission-dock";
import { SessionQuestionDock } from "./session-question-dock";

interface SessionComposerRegionProps {
  state: SessionComposerState;
  inactive?: boolean;
  children: ReactNode;
}

const dockTransition = { duration: 0.25, ease: "easeOut" } as const;
const dockInitial = { opacity: 0, height: 0 };
const dockAnimate = { opacity: 1, height: "auto" };
const dockExit = { opacity: 0, height: 0 };

function Dock({ keyId, children }: { keyId: string; children: ReactNode }) {
  return (
    <motion.div
      key={keyId}
      initial={dockInitial}
      animate={dockAnimate}
      exit={dockExit}
      transition={dockTransition}
      style={{ overflow: "hidden" }}
    >
      {children}
    </motion.div>
  );
}

export function SessionComposerRegion({
  state,
  inactive = false,
  children,
}: SessionComposerRegionProps) {
  const showPermission = useDelayedShow(!!state.permissionRequest);
  const showQuestion = useDelayedShow(!!state.questionRequest);
  const blocked = state.blocked || inactive;

  const question =
    showQuestion && state.questionRequest ? state.questionRequest : null;
  const permission =
    showPermission && state.permissionRequest ? state.permissionRequest : null;

  return (
    <div className="flex flex-col gap-3">
      <AnimatePresence initial={false}>
        {question && (
          <Dock keyId={`question-${question.id}`}>
            <SessionQuestionDock request={question} />
          </Dock>
        )}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {permission && (
          <Dock keyId={`permission-${permission.id}`}>
            <SessionPermissionDock
              request={permission}
              responding={state.permissionResponding}
              onDecide={state.decide}
            />
          </Dock>
        )}
      </AnimatePresence>
      <div
        inert={blocked}
        className={cn(
          "transition-opacity duration-200",
          blocked && "opacity-50",
        )}
      >
        {children}
      </div>
    </div>
  );
}
