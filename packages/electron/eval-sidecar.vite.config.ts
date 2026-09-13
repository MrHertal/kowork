import { defineConfig } from "electron-vite";
import {
  nodeBundleBanner,
  nodePtyPackage,
  opencodeServerPlugins,
} from "./scripts/opencode-server-build";

export default defineConfig({
  main: {
    build: {
      outDir: "out/eval-sidecar",
      rollupOptions: {
        input: { sidecar: "../../evals/sidecar.ts" },
        output: {
          banner: nodeBundleBanner,
        },
      },
      externalizeDeps: { include: [nodePtyPackage] },
    },
    plugins: opencodeServerPlugins(),
  },
});
