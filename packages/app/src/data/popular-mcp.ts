import type { McpOAuthConfig } from "@opencode-ai/sdk/v2/client";

import atlassianLogo from "@/assets/icons/mcp/atlassian.svg";
import canvaLogo from "@/assets/icons/mcp/canva.svg";
import googleCalendarLogo from "@/assets/icons/mcp/google-calendar.svg";
import linearLogo from "@/assets/icons/mcp/linear.svg";
import microsoft365Logo from "@/assets/icons/mcp/microsoft-365.svg";
import mondayLogo from "@/assets/icons/mcp/monday.svg";
import notionLogo from "@/assets/icons/mcp/notion.svg";
import slackLogo from "@/assets/icons/mcp/slack.svg";
import { m } from "@/paraglide/messages";

export interface PopularMcp {
  id: string;
  name: string;
  description: () => string;
  logo?: string;
  logoClassName?: string;
  url: string;
  oauth?: McpOAuthConfig;
}

const GOOGLE_CALENDAR_OAUTH_CLIENT_ID =
  "801121297074-89gb3k3te71oj640ee220ao77j5vr01t.apps.googleusercontent.com";
const GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET =
  "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";
const MICROSOFT_365_OAUTH_CLIENT_ID = "a74cabf5-5fff-40c3-a9d0-4ab50916c65e";
const SLACK_OAUTH_CLIENT_ID = "11986845307171.11988684447669";
const SLACK_OAUTH_SCOPE =
  "search:read.public,search:read.private,search:read.im,search:read.mpim,search:read.files,search:read.users,channels:history,groups:history,im:history,mpim:history,channels:read,groups:read,im:read,mpim:read,files:read,emoji:read,users:read,users:read.email,chat:write,reactions:write";

export const POPULAR_MCP: PopularMcp[] = [
  {
    id: "atlassian",
    name: "Atlassian",
    description: m.settings_mcp_popular_atlassian_description,
    logo: atlassianLogo,
    url: "https://mcp.atlassian.com/v1/mcp",
  },
  {
    id: "notion",
    name: "Notion",
    description: m.settings_mcp_popular_notion_description,
    logo: notionLogo,
    url: "https://mcp.notion.com/mcp",
  },
  {
    id: "linear",
    name: "Linear",
    description: m.settings_mcp_popular_linear_description,
    logo: linearLogo,
    logoClassName: "dark:invert",
    url: "https://mcp.linear.app/mcp",
  },
  {
    id: "microsoft-365",
    name: "Microsoft 365",
    description: m.settings_mcp_popular_microsoft_365_description,
    logo: microsoft365Logo,
    url: "https://workiq.svc.cloud.microsoft/mcp",
    oauth: {
      clientId: MICROSOFT_365_OAUTH_CLIENT_ID,
      // WorkIQ's first-party app ID — the scope form the server advertises.
      scope:
        "fdcc1f02-fc51-4226-8753-f668596af7f7/WorkIQAgent.Ask offline_access",
    },
  },
  {
    id: "monday",
    name: "monday.com",
    description: m.settings_mcp_popular_monday_description,
    logo: mondayLogo,
    url: "https://mcp.monday.com/mcp",
  },
  // Google's Workspace MCP servers are in Developer Preview, whose terms
  // forbid shipping pre-GA features publicly — dev-only until GA.
  ...(import.meta.env.DEV
    ? [
        {
          id: "google-calendar",
          name: "Google Calendar",
          description: m.settings_mcp_popular_google_calendar_description,
          logo: googleCalendarLogo,
          url: "https://calendarmcp.googleapis.com/mcp/v1",
          oauth: {
            clientId: GOOGLE_CALENDAR_OAUTH_CLIENT_ID,
            clientSecret: GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET,
            scope:
              "https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events.freebusy https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.events",
          },
        },
      ]
    : []),
  // Slack requires a Marketplace-published OAuth app with an HTTPS redirect
  // URI — dev-only until the Kowork Slack app passes Marketplace review.
  ...(import.meta.env.DEV
    ? [
        {
          id: "slack",
          name: "Slack",
          description: m.settings_mcp_popular_slack_description,
          logo: slackLogo,
          url: "https://mcp.slack.com/mcp",
          oauth: {
            clientId: SLACK_OAUTH_CLIENT_ID,
            scope: SLACK_OAUTH_SCOPE,
            redirectUri: "https://api.kowork.dev/mcp/oauth/callback",
          },
        },
      ]
    : []),
  // Canva allowlists HTTPS redirect URIs per OAuth client — dev-only until
  // the relay URI is approved (waitlist in progress).
  ...(import.meta.env.DEV
    ? [
        {
          id: "canva",
          name: "Canva",
          description: m.settings_mcp_popular_canva_description,
          logo: canvaLogo,
          url: "https://mcp.canva.com/mcp",
          oauth: {
            redirectUri: "https://api.kowork.dev/mcp/oauth/callback",
          },
        },
      ]
    : []),
];
