import type { Session } from "@opencode-ai/sdk/v2/client";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  DollarSign,
  FolderOpen,
  Sparkles,
} from "lucide-react";

import { m } from "@/paraglide/messages";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { DetailRow } from "./detail-row";
import { FeedbackButton } from "./feedback-button";

interface SessionStats {
  totalCost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cacheRead: number;
  };
  model: {
    provider: string;
    model: string;
  };
  messageCount: number;
}

const fakeSession: Session & { stats: SessionStats } = {
  id: "sess_abc123def456",
  slug: "implement-sidebar-session-display",
  projectID: "proj_xyz789",
  directory: "/Users/dev/projects/kowork",
  title: "Implement sidebar session display",
  version: "1.0.0",
  time: {
    created: Date.now() - 3600000 * 2, // 2 hours ago
    updated: Date.now() - 60000 * 5, // 5 minutes ago
  },
  summary: {
    additions: 847,
    deletions: 234,
    files: 12,
  },
  share: {
    url: "https://opencode.ai/share/abc123",
  },
  stats: {
    totalCost: 0.0847,
    tokens: {
      input: 45230,
      output: 12847,
      reasoning: 8420,
      cacheRead: 32100,
    },
    model: {
      provider: "amazon-bedrock",
      model: "claude-sonnet-4",
    },
    messageCount: 8,
  },
};

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) return m.common_relativeTime_justNow();
  if (minutes < 60)
    return m.common_relativeTime_minutesAgo({ minutes: String(minutes) });
  if (hours < 24)
    return m.common_relativeTime_hoursAgo({ hours: String(hours) });
  return new Date(timestamp).toLocaleDateString();
}

function formatNumber(num: number): string {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num.toString();
}

export function SidebarRight({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const session = fakeSession;

  return (
    <Sidebar
      collapsible="none"
      className="sticky top-0 hidden h-svh border-l lg:flex"
      {...props}
    >
      <SidebarHeader>
        <h3 className="mt-1 flex h-8 items-center px-2 text-sm font-semibold">
          {m.sessionInfo_title()}
        </h3>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{m.sessionInfo_activity()}</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <DetailRow
              icon={Clock}
              label={m.sessionInfo_created()}
              value={formatRelativeTime(session.time.created)}
            />
            <DetailRow
              icon={Activity}
              label={m.sessionInfo_lastActive()}
              value={formatRelativeTime(session.time.updated)}
            />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{m.sessionInfo_tokenUsage()}</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <DetailRow
              icon={ArrowDownToLine}
              label={m.sessionInfo_input()}
              value={formatNumber(session.stats.tokens.input)}
            />
            <DetailRow
              icon={ArrowUpFromLine}
              label={m.sessionInfo_output()}
              value={formatNumber(session.stats.tokens.output)}
            />
            <DetailRow
              icon={DollarSign}
              label={m.sessionInfo_cost()}
              value={`$${session.stats.totalCost.toFixed(4)}`}
            />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{m.sessionInfo_configuration()}</SidebarGroupLabel>
          <SidebarGroupContent className="px-2">
            <DetailRow
              icon={Sparkles}
              label={m.sessionInfo_model()}
              value={session.stats.model.model}
            />
            <DetailRow
              icon={FolderOpen}
              label={m.sessionInfo_folder()}
              value={
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="truncate">
                      {session.directory.split("/").pop() ?? ""}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end">
                    {session.directory}
                  </TooltipContent>
                </Tooltip>
              }
            />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-3">
        <FeedbackButton />
      </SidebarFooter>
    </Sidebar>
  );
}
