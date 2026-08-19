import atlassianLogo from "@/assets/icons/mcp/atlassian.svg";
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
}

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
];
