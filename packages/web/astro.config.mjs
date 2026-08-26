// @ts-check
import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import starlight from "@astrojs/starlight";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  site: "https://getkowork.com",
  devToolbar: {
    enabled: false,
  },
  integrations: [
    react(),
    starlight({
      title: "Kowork",
      description: "Learn how to use Kowork.",
      logo: {
        src: "./public/favicon-96x96.png",
        alt: "Kowork",
      },
      customCss: ["./src/styles/docs.css"],
      head: [
        {
          tag: "meta",
          attrs: { name: "theme-color", content: "#F8F7F7" },
        },
        {
          tag: "meta",
          attrs: {
            name: "theme-color",
            content: "#131010",
            media: "(prefers-color-scheme: dark)",
          },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image",
            content: "https://getkowork.com/og-image.png",
          },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:type", content: "image/png" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:width", content: "1200" },
        },
        {
          tag: "meta",
          attrs: { property: "og:image:height", content: "630" },
        },
        {
          tag: "meta",
          attrs: {
            property: "og:image:alt",
            content:
              "Kowork completing an Excel sales report from a plain-language request",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image",
            content: "https://getkowork.com/og-image.png",
          },
        },
        {
          tag: "meta",
          attrs: {
            name: "twitter:image:alt",
            content:
              "Kowork completing an Excel sales report from a plain-language request",
          },
        },
      ],
      disable404Route: true,
      sidebar: [
        { label: "Welcome", link: "/docs/" },
        {
          label: "Getting Started",
          items: [
            {
              label: "Install Kowork",
              link: "/docs/getting-started/install/",
            },
            {
              label: "Connect an AI Provider",
              link: "/docs/getting-started/connect-provider/",
            },
            {
              label: "Create Your First Task",
              link: "/docs/getting-started/first-task/",
            },
          ],
        },
        {
          label: "Using Kowork",
          items: [
            {
              label: "Folders and Files",
              link: "/docs/using-kowork/folders-and-files/",
            },
            {
              label: "Tasks and Subtasks",
              link: "/docs/using-kowork/tasks-and-subtasks/",
            },
            {
              label: "Create Office Documents",
              link: "/docs/using-kowork/office-documents/",
            },
            {
              label: "Permissions and Safety",
              link: "/docs/using-kowork/permissions/",
            },
          ],
        },
        {
          label: "Customize Kowork",
          items: [
            {
              label: "Providers and Models",
              link: "/docs/customize/providers-and-models/",
            },
            { label: "Connectors", link: "/docs/customize/connectors/" },
            { label: "Skills", link: "/docs/customize/skills/" },
            { label: "Settings", link: "/docs/customize/settings/" },
          ],
        },
        {
          label: "Help",
          items: [
            {
              label: "Troubleshooting",
              link: "/docs/help/troubleshooting/",
            },
          ],
        },
      ],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/MrHertal/kowork",
        },
      ],
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
