import { ChevronDownIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  type ReactNode,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
} from "react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

const statusTransition = {
  duration: 0.4,
  ease: [0.4, 0, 0.2, 1],
} as const;
const statusMinimumDuration = 1000;

function ActivityStatus({ status }: { status: string }) {
  const reducedMotion = useReducedMotion();
  const [{ status: displayedStatus, animateEntry }, setDisplayed] = useState({
    status,
    animateEntry: false,
  });
  const displayedAt = useRef(Date.now());
  const showLatestStatus = useEffectEvent(() => {
    displayedAt.current = Date.now();
    setDisplayed({ status, animateEntry: true });
  });

  useEffect(() => {
    if (status === displayedStatus) return;

    const elapsed = Date.now() - displayedAt.current;
    const timeout = window.setTimeout(
      showLatestStatus,
      Math.max(0, statusMinimumDuration - elapsed),
    );

    return () => window.clearTimeout(timeout);
  }, [status, displayedStatus]);

  if (reducedMotion) {
    return (
      <Shimmer as="span" duration={1} className="whitespace-nowrap">
        {displayedStatus}
      </Shimmer>
    );
  }

  return (
    <>
      <span className="sr-only">{displayedStatus}</span>
      <span
        aria-hidden="true"
        className="relative inline-flex h-5 overflow-x-visible overflow-y-clip whitespace-nowrap"
      >
        <AnimatePresence mode="popLayout">
          <motion.span
            key={displayedStatus}
            initial={animateEntry ? { y: "100%" } : false}
            animate={{ y: 0 }}
            exit={{ y: "-100%" }}
            transition={statusTransition}
          >
            <Shimmer as="span" duration={1}>
              {displayedStatus}
            </Shimmer>
          </motion.span>
        </AnimatePresence>
      </span>
    </>
  );
}

export function Activity({
  children,
  running,
  status,
  summary,
}: {
  children: ReactNode;
  running?: boolean;
  status?: string;
  summary: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className={cn(
          "group/activity flex w-fit max-w-full items-center gap-2 text-sm text-muted-foreground transition-colors",
          !running && "hover:text-foreground",
        )}
      >
        {running ? (
          <>
            <ActivityStatus status={status ?? m.session_activity_working()} />
            <span className="sr-only">
              {open ? m.session_activity_hide() : m.session_activity_show()}
            </span>
          </>
        ) : (
          <>
            <span className="min-w-0 truncate font-medium">{summary}</span>
            <span className="sr-only">
              {open ? m.session_activity_hide() : m.session_activity_show()}
            </span>
          </>
        )}
        {!running && (
          <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/activity:rotate-180" />
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden text-sm outline-none data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div className="pt-4">
          <div className="flex flex-col gap-4 border-l-2 border-muted pl-4">
            {children}
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
