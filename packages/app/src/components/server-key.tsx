import { Fragment, type ReactNode } from "react";
import { useServer } from "@/contexts/server";

export function ServerKey({ children }: { children: ReactNode }) {
  const server = useServer();
  if (!server.key) return null;
  return <Fragment key={server.key}>{children}</Fragment>;
}
