import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface SidebarRightContextProps {
  available: boolean;
  open: boolean;
  visible: boolean;
  toggle: () => void;
  _registerContent: () => () => void;
}

const SidebarRightContext = createContext<SidebarRightContextProps | null>(
  null,
);

export function useSidebarRight() {
  const context = useContext(SidebarRightContext);
  if (!context) {
    throw new Error(
      "useSidebarRight must be used within a SidebarRightProvider",
    );
  }
  return context;
}

export function SidebarRightProvider({
  routeAvailable,
  children,
}: {
  routeAvailable: boolean;
  children: React.ReactNode;
}) {
  const [contentAvailable, setContentAvailable] = useState(false);
  const [open, setOpen] = useState(true);
  const available = routeAvailable && contentAvailable;
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const registerContent = useCallback(() => {
    setContentAvailable(true);
    return () => setContentAvailable(false);
  }, []);
  const visible = available && open;
  const value = useMemo(
    () => ({
      available,
      open,
      visible,
      toggle,
      _registerContent: registerContent,
    }),
    [available, open, visible, toggle, registerContent],
  );

  return (
    <SidebarRightContext.Provider value={value}>
      {children}
    </SidebarRightContext.Provider>
  );
}
