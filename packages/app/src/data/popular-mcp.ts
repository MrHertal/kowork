import atlassianLogo from "@/assets/icons/mcp/atlassian.svg";
import googleCalendarLogo from "@/assets/icons/mcp/google-calendar.svg";
import linearLogo from "@/assets/icons/mcp/linear.svg";
import mondayLogo from "@/assets/icons/mcp/monday.svg";
import notionLogo from "@/assets/icons/mcp/notion.svg";
import { m } from "@/paraglide/messages";

export interface PopularMcp {
  id: string;
  name: string;
  description: () => string;
  logo?: string;
  url: string;
  oauth?: { clientId: string; clientSecret?: string; scope?: string };
}

const GOOGLE_CALENDAR_OAUTH_CLIENT_ID =
  "801121297074-89gb3k3te71oj640ee220ao77j5vr01t.apps.googleusercontent.com";
const GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET =
  "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";

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
    url: "https://mcp.linear.app/mcp",
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
];
