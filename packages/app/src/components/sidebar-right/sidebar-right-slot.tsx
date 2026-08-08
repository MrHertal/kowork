import { type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { useSidebarRight } from "@/components/sidebar-right/sidebar-right-context";

export const SIDEBAR_RIGHT_CONTENT_ID = "kowork-sidebar-right-content";

export function SidebarRightSlot({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const { _registerContent } = useSidebarRight();

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only after mount
    setTarget(document.getElementById(SIDEBAR_RIGHT_CONTENT_ID));
    return _registerContent();
  }, [_registerContent]);

  return target ? createPortal(children, target) : null;
}
