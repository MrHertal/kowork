import { expect, test } from "@playwright/test";

import {
  createdSessionID,
  directory,
  modelID,
  mockOpenCode,
  providerID,
  sessionID,
} from "../utils/mock-opencode";

test("creates a task and submits its first message", async ({ page }) => {
  const opencode = await mockOpenCode(page);

  try {
    await page.goto("/");

    const composer = page.getByPlaceholder("How can I help you today?");
    const submit = page.getByRole("button", { name: "Submit" });
    await expect(composer).toBeVisible();
    await expect(submit).toBeDisabled();

    const promptText = "Create this task from my first message.";
    await composer.fill(promptText);
    await expect(submit).toBeEnabled();
    await submit.click();

    const sessionCreate = await opencode.waitForSessionCreate();
    expect(sessionCreate.body).toMatchObject({
      metadata: { "kowork.directoryMode": "default" },
    });
    await sessionCreate.accept();

    const prompt = await opencode.waitForPrompt();
    expect(prompt.sessionID).toBe(createdSessionID);
    expect(prompt.body).toMatchObject({
      agent: "build",
      model: { providerID, modelID },
      parts: [{ type: "text", text: promptText }],
    });
    expect(prompt.body.messageID).toEqual(expect.any(String));
    await prompt.accept();

    await expect(page).toHaveURL(`/session/${createdSessionID}`);
    await expect(
      page.getByRole("log").getByText(promptText, { exact: true }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("Write a message")).toHaveValue("");
  } finally {
    await opencode.close();
  }
});

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

test("answers a pending permission request", async ({ page }) => {
  const permissionID = "per_browser_smoke";
  const opencode = await mockOpenCode(page, {
    permissionRequests: [
      {
        id: permissionID,
        sessionID,
        permission: "bash",
        patterns: ["pnpm test"],
        metadata: {},
        always: [],
      },
    ],
  });

  try {
    await page.goto(`/session/${sessionID}`);
    await opencode.events.waitForConnection();

    await expect(page.getByText("Permission required")).toBeVisible();
    await expect(page.getByText("Run commands on your computer")).toBeVisible();
    await expect(page.getByText("pnpm test", { exact: true })).toBeVisible();

    const allowOnce = page.getByRole("button", { name: "Allow once" });
    await allowOnce.click();

    const reply = await opencode.waitForPermissionReply();
    expect(reply).toMatchObject({
      requestID: permissionID,
      body: { reply: "once" },
    });
    await expect(allowOnce).toBeDisabled();
    await reply.accept();

    await opencode.events.send({
      directory,
      payload: {
        type: "permission.replied",
        properties: { sessionID, requestID: permissionID, reply: "once" },
      },
    });

    await expect(page.getByText("Permission required")).toHaveCount(0);
    const composer = page.getByPlaceholder("Write a message");
    await composer.fill("Continue after allowing the command");
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
  } finally {
    await opencode.close();
  }
});

test("stops a busy task", async ({ page }) => {
  const opencode = await mockOpenCode(page, {
    sessionStatus: { [sessionID]: { type: "busy" } },
  });

  try {
    await page.goto(`/session/${sessionID}`);
    await opencode.events.waitForConnection();

    const stop = page.getByRole("button", { name: "Stop" });
    await expect(stop).toBeVisible();
    await stop.click();
    await opencode.waitForAbort();

    await opencode.events.send({
      directory,
      payload: {
        type: "session.status",
        properties: { sessionID, status: { type: "idle" } },
      },
    });

    const composer = page.getByPlaceholder("Write a message");
    const submit = page.getByRole("button", { name: "Submit" });
    await expect(submit).toBeDisabled();
    await composer.fill("Continue after stopping");
    await expect(submit).toBeEnabled();
  } finally {
    await opencode.close();
  }
});

test("restores the draft when prompt submission fails", async ({ page }) => {
  const opencode = await mockOpenCode(page);

  try {
    await page.goto(`/session/${sessionID}`);

    const composer = page.getByPlaceholder("Write a message");
    const conversation = page.getByRole("log");
    const promptText = "Keep this draft after an error.";
    await composer.fill(promptText);
    await page.getByRole("button", { name: "Submit" }).click();

    const prompt = await opencode.waitForPrompt();
    await expect(
      conversation.getByText(promptText, { exact: true }),
    ).toBeVisible();
    await expect(composer).toHaveValue("");
    await prompt.reject();

    await expect(
      page.getByText("Request failed", { exact: true }),
    ).toBeVisible();
    await expect(composer).toHaveValue(promptText);
    await expect(
      conversation.getByText(promptText, { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Submit" })).toBeEnabled();
  } finally {
    await opencode.close();
  }
});

test("keeps a newer task status over a stale bootstrap response", async ({
  page,
}) => {
  const opencode = await mockOpenCode(page, { deferSessionStatus: true });

  try {
    await page.goto(`/session/${sessionID}`);
    await opencode.events.waitForConnection();
    const statusRequest = await opencode.waitForSessionStatus();

    await opencode.events.send({
      directory,
      payload: {
        type: "session.status",
        properties: { sessionID, status: { type: "busy" } },
      },
    });

    const stop = page.getByRole("button", { name: "Stop" });
    await expect(stop).toBeVisible();
    await statusRequest.respond({});
    await expect(stop).toBeVisible();
  } finally {
    await opencode.close();
  }
});
