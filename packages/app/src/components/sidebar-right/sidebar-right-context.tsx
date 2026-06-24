import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

interface SidebarRightContextProps {
  open: boolean;
  toggle: () => void;
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
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const value = useMemo(() => ({ open, toggle }), [open, toggle]);

  return (
    <SidebarRightContext.Provider value={value}>
      {children}
    </SidebarRightContext.Provider>
  );
}
