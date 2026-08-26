import type { APIRoute } from "astro";
import { getCollection } from "astro:content";

// Section order mirrors the sidebar in astro.config.mjs. Docs pages not
// listed here are appended to the section matching their path prefix, so new
// pages are never silently dropped.
const sections: Array<{ heading: string; prefix: string; ids: string[] }> = [
  {
    heading: "Getting Started",
    prefix: "docs/getting-started/",
    ids: [
      "docs/getting-started/install",
      "docs/getting-started/connect-provider",
      "docs/getting-started/first-task",
    ],
  },
  {
    heading: "Using Kowork",
    prefix: "docs/using-kowork/",
    ids: [
      "docs/using-kowork/folders-and-files",
      "docs/using-kowork/tasks-and-subtasks",
      "docs/using-kowork/office-documents",
      "docs/using-kowork/permissions",
    ],
  },
  {
    heading: "Customize Kowork",
    prefix: "docs/customize/",
    ids: [
      "docs/customize/providers-and-models",
      "docs/customize/connectors",
      "docs/customize/skills",
      "docs/customize/settings",
    ],
  },
  { heading: "Help", prefix: "docs/help/", ids: ["docs/help/troubleshooting"] },
];

export const GET: APIRoute = async ({ site }) => {
  const origin = site?.origin ?? "https://getkowork.com";
  const docs = await getCollection("docs");
  const byId = new Map(docs.map((entry) => [entry.id, entry]));
  const listed = new Set<string>();

  const link = (id: string): string | undefined => {
    const entry = byId.get(id);
    if (!entry) return undefined;
    listed.add(id);
    const description = entry.data.description
      ? `: ${entry.data.description}`
      : "";
    return `- [${entry.data.title}](${origin}/${id}/)${description}`;
  };

  const parts = [
    "# Kowork",
    "",
    "> Kowork is an open-source desktop app that lets you hand real work to AI agents. Choose a folder, describe the result you want in everyday language, and Kowork reads, creates, and organizes files there for you to review.",
    "",
    "Kowork is available for macOS and Windows. The links below cover the product site and the complete user documentation.",
    "",
    "## Product",
    "",
    `- [Kowork](${origin}/): Product overview and download for macOS and Windows.`,
    "- [GitHub repository](https://github.com/MrHertal/kowork): Source code, releases, and issue tracker.",
  ];

  const welcome = link("docs");
  if (welcome) {
    parts.push("", "## Documentation", "", welcome);
  }

  for (const section of sections) {
    const lines = section.ids
      .map(link)
      .concat(
        docs
          .filter(
            (entry) =>
              !listed.has(entry.id) && entry.id.startsWith(section.prefix),
          )
          .map((entry) => link(entry.id)),
      )
      .filter((line): line is string => line !== undefined);
    if (lines.length > 0) {
      parts.push("", `## ${section.heading}`, "", ...lines);
    }
  }

  const remaining = docs
    .filter((entry) => !listed.has(entry.id))
    .map((entry) => link(entry.id))
    .filter((line): line is string => line !== undefined);
  if (remaining.length > 0) {
    parts.push("", "## More", "", ...remaining);
  }

  return new Response(`${parts.join("\n")}\n`, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
