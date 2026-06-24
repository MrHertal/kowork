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
    logo: "/icons/mcp/atlassian.svg",
    url: "https://mcp.atlassian.com/v1/mcp",
  },
];
