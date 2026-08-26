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
      title: "Kowork Documentation",
      description: "Learn how to use Kowork.",
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
