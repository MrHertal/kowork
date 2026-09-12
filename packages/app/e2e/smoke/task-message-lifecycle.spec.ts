import { expect, test } from "@playwright/test";

import {
  directory,
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

test("streams an assistant response and returns to ready", async ({ page }) => {
  const opencode = await mockOpenCode(page);

  try {
    await page.goto(`/session/${sessionID}`);
    await opencode.events.waitForConnection();

    const composer = page.getByPlaceholder("Write a message");
    const sendEvent = (type: string, properties: Record<string, unknown>) =>
      opencode.events.send({
        directory,
        payload: { type, properties },
      });
    const promptText = "Say hello.";
    await composer.fill(promptText);
    await page.getByRole("button", { name: "Submit" }).click();

    const prompt = await opencode.waitForPrompt();
    await prompt.accept();
    await sendEvent("session.status", {
      sessionID,
      status: { type: "busy" },
    });
    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();

    const userMessageID = prompt.body.messageID;
    expect(userMessageID).toEqual(expect.any(String));
    if (!userMessageID) throw new Error("Prompt did not include a message ID");

    const assistantMessageID = "msg_ffffffffffffffffffffffffff";
    const assistantPartID = "prt_ffffffffffffffffffffffffff";
    const created = Date.now();

    await sendEvent("message.updated", {
      info: {
        id: assistantMessageID,
        sessionID,
        role: "assistant",
        time: { created },
        parentID: userMessageID,
        modelID,
        providerID,
        mode: "build",
        agent: "build",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: {
          input: 4,
          output: 0,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
      },
    });
    await sendEvent("message.part.updated", {
      part: {
        id: assistantPartID,
        sessionID,
        messageID: assistantMessageID,
        type: "text",
        text: "",
      },
    });
    await sendEvent("message.part.delta", {
      sessionID,
      messageID: assistantMessageID,
      partID: assistantPartID,
      field: "text",
      delta: "Hello",
    });
    await expect(page.getByText("Hello", { exact: true })).toBeVisible();

    await sendEvent("message.part.delta", {
      sessionID,
      messageID: assistantMessageID,
      partID: assistantPartID,
      field: "text",
      delta: " from Kowork.",
    });
    await expect(
      page.getByText("Hello from Kowork.", { exact: true }),
    ).toBeVisible();

    await sendEvent("message.updated", {
      info: {
        id: assistantMessageID,
        sessionID,
        role: "assistant",
        time: { created, completed: created + 1_000 },
        parentID: userMessageID,
        modelID,
        providerID,
        mode: "build",
        agent: "build",
        path: { cwd: directory, root: directory },
        cost: 0,
        tokens: {
          input: 4,
          output: 4,
          reasoning: 0,
          cache: { read: 0, write: 0 },
        },
        finish: "stop",
      },
    });
    await sendEvent("session.status", {
      sessionID,
      status: { type: "idle" },
    });

    const submit = page.getByRole("button", { name: "Submit" });
    await expect(submit).toBeDisabled();
    await composer.fill("A follow-up message");
    await expect(submit).toBeEnabled();
  } finally {
    await opencode.close();
  }
});
