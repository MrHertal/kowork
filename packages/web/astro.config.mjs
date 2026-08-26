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
      ],
      disable404Route: true,
      sidebar: [
        {
          label: "Documentation",
          items: [{ autogenerate: { directory: "docs" } }],
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
