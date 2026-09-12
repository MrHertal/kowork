import { expect, test } from "@playwright/test";

import {
  modelID,
  mockOpenCode,
  providerID,
  sessionID,
} from "../utils/mock-opencode";

test("submits a plain message to OpenCode", async ({ page }) => {
  const opencode = await mockOpenCode(page);

  try {
    await page.goto(`/session/${sessionID}`);

    const composer = page.getByPlaceholder("Write a message");
    const submit = page.getByRole("button", { name: "Submit" });
    await expect(composer).toBeVisible();
    await expect(submit).toBeDisabled();

    const promptText = "Reply with exactly: Hello from Kowork.";
    await composer.fill(promptText);
    await expect(submit).toBeEnabled();
    await submit.click();

    const prompt = await opencode.waitForPrompt();
    expect(prompt.body).toMatchObject({
      agent: "build",
      model: { providerID, modelID },
      parts: [{ type: "text", text: promptText }],
    });
    expect(prompt.body.messageID).toEqual(expect.any(String));
    await expect(page.getByText(promptText, { exact: true })).toBeVisible();
    await expect(composer).toHaveValue("");

    await prompt.accept();
  } finally {
    await opencode.close();
  }
});
