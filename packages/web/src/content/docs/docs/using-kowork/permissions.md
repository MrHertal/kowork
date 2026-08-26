---
title: Permissions and Safety
description: Control when Kowork pauses before sensitive actions.
---

Permissions let you decide how Kowork handles sensitive actions such as reading or changing files, running commands, accessing files outside the selected folder, searching the web, or launching subtasks.

The permission mode is shown below the message box. You can choose it before starting a task and change it while working in the main task.

## Manual mode

**Manual** is the default. Kowork pauses when an action needs approval and shows what it wants to do, including relevant file paths or patterns when available.

Choose:

- **Allow once** to approve only the current request.
- **Always allow** to approve the matching kind of action without another prompt.
- **Deny** to reject the request. Kowork may stop that operation or try a safer alternative.

Before approving, check that the action matches your request and that any shown paths point to the files you expect.

:::tip
Use **Allow once** when you are unsure. It lets the task continue without creating a broader matching approval.
:::

## Auto mode

**Auto** automatically approves sensitive actions without asking. This includes permission requests raised by the task's subtasks.

Auto is useful for trusted, well-scoped work where repeated pauses would get in the way. It also means Kowork may create or change files, run commands, use the web, or access requested locations without giving you a chance to inspect each permission first.

:::caution
Use Auto only with a narrowly selected folder, trusted files, and a request whose effects you understand. Review the result and changed files afterward.
:::

Switch back to **Manual** at any time to require approval for future sensitive actions. Changing the mode does not undo actions that already ran.

## Safer working habits

- Select only the folder needed for the task.
- Keep backups or use copies of important files.
- State which files Kowork may change and which it must leave alone.
- Prefer Manual for unfamiliar folders, downloaded files, or tasks involving credentials and private information.
- Read paths and action descriptions before choosing **Always allow**.
- Stop and deny a request if Kowork repeats an action or the request does not match your goal.

Permissions control whether an action is approved; they do not guarantee that an approved action is correct or reversible. Connectors, model providers, websites, and other services used during a task may process information according to their own settings and policies.

See [Folders and Files](/docs/using-kowork/folders-and-files/) for how the selected folder affects a task, and [Tasks and Subtasks](/docs/using-kowork/tasks-and-subtasks/) for delegated work.
