import { Link } from "@tanstack/react-router";
import { BanIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { m } from "@/paraglide/messages";

import { getToolInfo } from "../tool-info";
import { BasicTool } from "./basic-tool";

export interface ToolErrorCardProps {
  tool: string;
  error: string;
  defaultOpen?: boolean;
  subtitle?: string;
  href?: string;
}

export function ToolErrorCard({
  tool,
  error,
  defaultOpen = false,
  subtitle: subtitleProp,
  href,
}: ToolErrorCardProps) {
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  const info = getToolInfo(tool);
  const cleaned = error.replace(/^Error:\s*/, "").trim();

  const tail = cleaned.startsWith(`${tool} `)
    ? cleaned.slice(tool.length + 1)
    : cleaned;

  const parts = tail.split(": ");
  const subtitle = subtitleProp
    ? subtitleProp
    : parts.length > 1 && parts[0]?.trim()
      ? parts[0].trim().charAt(0).toUpperCase() + parts[0].trim().slice(1)
      : m.session_tool_error_failed();
  const body =
    parts.length > 1 ? parts.slice(1).join(": ").trim() || cleaned : cleaned;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cleaned);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const trigger = (
    <div className="flex min-w-0 items-center gap-2">
      <BanIcon className="size-4 shrink-0" />
      <span className="shrink-0 font-medium">{info.title}</span>
      {href && subtitleProp ? (
        <Link
          to={href}
          className="truncate underline-offset-2 hover:underline"
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
        >
          {subtitle}
        </Link>
      ) : (
        <span className="truncate">{subtitle}</span>
      )}
    </div>
  );

  return (
    <BasicTool trigger={trigger} defaultOpen={defaultOpen}>
      <div className="relative">
        <button
          type="button"
          className="absolute top-3 right-3 rounded p-1 text-muted-foreground hover:text-foreground"
          onClick={() => void handleCopy()}
          aria-label={m.session_tool_error_copy()}
        >
          {copied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
        </button>
        <pre className="rounded-md bg-muted p-3 text-sm wrap-break-word whitespace-pre-wrap text-muted-foreground">
          {body}
        </pre>
      </div>
    </BasicTool>
  );
}
