import { realpathSync } from "node:fs";

export default async ({ directory }) => ({
  "experimental.chat.system.transform": (_input, output) => {
    const expected = process.env.KOWORK_EVAL_EXPECTED_SYSTEM;
    if (!expected) throw new Error("Missing expected Kowork system prompt");
    const expectedDirectory = process.env.KOWORK_EVAL_EXPECTED_DIRECTORY;
    if (!expectedDirectory)
      throw new Error("Missing expected Kowork evaluation folder");
    const directoryMatches =
      realpathSync(directory) === realpathSync(expectedDirectory);

    const combined = output.system.join("\n");
    if (!directoryMatches)
      throw new Error("Kowork evaluation task folder changed");
    const gradingSystem = process.env.KOWORK_EVAL_GRADING_SYSTEM;
    if (gradingSystem && combined.endsWith(gradingSystem)) {
      if (
        combined.length === gradingSystem.length ||
        combined.split(gradingSystem).length !== 2 ||
        combined.includes(expected)
      )
        throw new Error("Kowork evaluation grading prompt composition changed");
      console.log(
        `SYSTEM_DIAGNOSTIC=${JSON.stringify({
          role: "grader",
          directory,
          directoryMatches,
        })}`,
      );
      return;
    }
    const heading = /(?:^|\n)# Kowork(?:\n|$)/g;
    const headingCount = (combined.match(heading) ?? []).length;
    const exactPromptCount = combined.split(expected).length - 1;
    const followsBasePrompt =
      combined.endsWith(expected) && combined.length > expected.length;

    console.log(
      `SYSTEM_DIAGNOSTIC=${JSON.stringify({
        characters: combined.length,
        koworkHeadingIndex: combined.search(heading),
        koworkHeadingCount: headingCount,
        exactPromptCount,
        followsBasePrompt,
        directory,
        directoryMatches,
      })}`,
    );

    if (headingCount !== 1 || exactPromptCount !== 1 || !followsBasePrompt)
      throw new Error("Kowork system prompt composition changed");
  },
});
