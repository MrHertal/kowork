import { Dialog as DialogPrimitive } from "radix-ui";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

import { useSettings } from "@/contexts/settings";

type DialogElement = () => ReactNode;

interface DialogContextValue {
  active: boolean;
  show: (element: DialogElement, onClose?: () => void) => void;
  close: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

interface DialogProviderProps {
  children: ReactNode;
}

export function DialogProvider(props: DialogProviderProps) {
  const [content, setContent] = useState<DialogElement | null>(null);
  const [showId, setShowId] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const onCloseRef = useRef<(() => void) | undefined>(undefined);

  const close = useCallback(() => {
    onCloseRef.current?.();
    onCloseRef.current = undefined;
    document.body.removeAttribute("data-swapping");
    setIsOpen(false);
  }, []);

  const show = useCallback(
    (element: DialogElement, onClose?: () => void) => {
      // Mark body synchronously so the new overlay/content mount with
      // enter animations suppressed. Cleared only when the dialog closes.
      if (isOpen) {
        document.body.setAttribute("data-swapping", "");
      }
      onCloseRef.current = onClose;
      setContent(() => element);
      setShowId((id) => id + 1);
      setIsOpen(true);
    },
    [isOpen],
  );

  const ctxValue = useMemo<DialogContextValue>(
    () => ({ active: isOpen, show, close }),
    [isOpen, show, close],
  );

  return (
    <DialogContext.Provider value={ctxValue}>
      {props.children}
      <DialogPrimitive.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        {content && <DialogContentRenderer key={showId} render={content} />}
      </DialogPrimitive.Root>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) {
    throw new Error("useDialog must be used within a DialogProvider");
  }
  return ctx;
}

// Re-invokes `render` on locale change so the dialog re-translates without
// remounting the Radix portal (which would close and reopen the dialog).
function DialogContentRenderer({ render }: { render: DialogElement }) {
  void useSettings().general.language;
  return <>{render()}</>;
}
