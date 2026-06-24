import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";

const theme = fileURLToPath(
  new URL("./public/kw-theme-preload.js", import.meta.url),
);

/** @type {import("vite").PluginOption[]} */
export default [
  {
    name: "kowork-desktop:config",
    config() {
      return {
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
          },
        },
        worker: {
          format: "es",
        },
      };
    },
  },
  {
    name: "kowork-desktop:theme-preload",
    transformIndexHtml(html) {
      return html.replace(
        /<script id="kw-theme-preload-script" src="[^"]*kw-theme-preload\.js"><\/script>/,
        `<script id="kw-theme-preload-script">${readFileSync(theme, "utf8")}</script>`,
      );
    },
  },
  paraglideVitePlugin({
    project: fileURLToPath(new URL("./project.inlang", import.meta.url)),
    outdir: fileURLToPath(new URL("./src/paraglide", import.meta.url)),
    strategy: [
      "custom-platform-storage",
      "cookie",
      "globalVariable",
      "preferredLanguage",
      "baseLocale",
    ],
  }),
  // Please make sure that '@tanstack/router-plugin' is passed before '@vitejs/plugin-react'
  tanstackRouter({
    target: "react",
    autoCodeSplitting: true,
    routesDirectory: fileURLToPath(new URL("./src/routes", import.meta.url)),
    generatedRouteTree: fileURLToPath(
      new URL("./src/routeTree.gen.ts", import.meta.url),
    ),
  }),
  react(),
  tailwindcss(),
];
