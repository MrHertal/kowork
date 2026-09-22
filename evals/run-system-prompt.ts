import * as path from "node:path";

import { runSidecarEval } from "./run-sidecar-eval";
import { evalSystemPrompt, gradingSystemPrompt } from "./system-prompt";

const repoRoot = path.resolve(import.meta.dirname, "..");

process.exitCode = await runSidecarEval({
  promptfooConfig: path.join(repoRoot, "evals/promptfooconfig.ts"),
  resultsDir: path.join(repoRoot, "tmp/promptfoo"),
  expectedSystemPrompt: evalSystemPrompt,
  gradingSystemPrompt,
});
