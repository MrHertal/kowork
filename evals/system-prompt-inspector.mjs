export default async () => ({
  "experimental.chat.system.transform": (_input, output) => {
    const expected = process.env.KOWORK_EVAL_EXPECTED_SYSTEM;
    if (!expected) throw new Error("Missing expected Kowork system prompt");

    const combined = output.system.join("\n");
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
      })}`,
    );

    if (headingCount !== 1 || exactPromptCount !== 1 || !followsBasePrompt)
      throw new Error("Kowork system prompt composition changed");
  },
});
