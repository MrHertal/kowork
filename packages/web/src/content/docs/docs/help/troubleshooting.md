---
title: Troubleshooting
description: Fix common installation, connection, task, permission, connector, and update problems in Kowork.
---

Start with the section that matches what you see. If Kowork shows an error, keep the exact message so you can include it in a bug report if the problem continues.

## Kowork will not install or open

1. Confirm that your computer is supported: Kowork currently requires an Apple silicon Mac (M1 or newer) or 64-bit Windows. Intel Macs and Linux are not supported.
2. Download Kowork again from the [official download page](/download) or the [latest GitHub release](https://github.com/MrHertal/kowork/releases/latest). Choose the `.dmg` file for macOS or the `.exe` file for Windows.
3. Follow the platform steps in [Install Kowork](/docs/getting-started/install/). On macOS, drag Kowork into **Applications** before opening it. On Windows, finish the installer before opening Kowork.
4. If Windows shows Microsoft Defender SmartScreen, check that the installer came from an official source, then select **More info** and **Run anyway**.
5. If the download is incomplete, the installer reports an error, or your computer says the app is damaged, delete that download and download a fresh copy from an official source.
6. If Kowork previously opened, quit it completely and open it again. If that does not help, restart your computer, then install the latest release again.

:::caution
Do not use instructions from an error message or another website to bypass your computer's protections. If a fresh official download is still blocked, [report the problem](#report-a-bug) and include the exact message.
:::

## Kowork cannot connect

If Kowork says **Kowork can't connect right now**, leave the app open briefly. It retries automatically.

If it does not reconnect:

1. Check that your internet connection works in a browser.
2. Quit Kowork completely and open it again.
3. Install any update offered in the sidebar. On macOS, you can also choose **Kowork → Check for Updates…**.
4. If an update check fails, try again later or install the [latest release](https://github.com/MrHertal/kowork/releases/latest) manually.

If you see **Unable to load the default folder**, select **Retry**. If a particular folder no longer loads, confirm that it still exists and that any external drive containing it is connected. Then choose that folder again. See [Folders and Files](/docs/using-kowork/folders-and-files/).

## An AI provider will not connect

Open **Settings → Providers** and check whether the provider appears under **Connected**.

### API key problems

1. Copy a new API key directly from your provider's website. Do not include spaces before or after it.
2. Return to **Settings → Providers**, disconnect the provider if it is listed, then connect it again with the new key.
3. If Kowork shows **Failed to save API key**, check your internet connection and try again.
4. Check the provider's website for an expired or disabled key, missing credits, spending limits, or a service outage.

### Sign-in or authorization problems

1. Start the connection again from **Settings → Providers**.
2. Complete the authorization in the browser using the same provider account you intend to use.
3. If Kowork asks for an authorization code, paste the newest code from the authorization page. Codes that are incomplete, expired, or already used may be rejected.
4. If the browser page was closed or Kowork remains on **Waiting for authorization…**, cancel the connection and start again.

After connecting, select a model before sending a message. If you see **No models found** or **Model not found**, choose another model or reconnect the provider. See [Connect an AI Provider](/docs/getting-started/connect-provider/) and [Providers and Models](/docs/customize/providers-and-models/).

:::note
Provider access, credits, quotas, and service availability are managed by the provider. Kowork may wait and retry temporary limits automatically. For **Free usage exceeded**, add credits with the provider or choose another connected model.
:::

## A task fails or stops responding

### Kowork says it is retrying

Wait for the countdown to finish. Kowork automatically retries temporary provider and quota errors. Repeated retries can mean that the provider is busy or your account has reached a limit.

If retries continue for a long time, use the stop button in the message box, check your provider account, and try again later or choose another connected model.

### A step shows Failed

1. Open the failed step to read its message. Use **Copy error** if you need to keep the full text.
2. Check whether a referenced file or folder was moved, renamed, deleted, or disconnected.
3. If an attachment says it is no longer available, remove it and attach the file again. Unsupported file types must be converted to a supported format before attaching.
4. Tell Kowork what failed and ask it to try a safer alternative. For a large request, try a smaller, more specific request.
5. If the task cannot continue, start a new task in the correct folder. Your existing task remains in **Recents** unless you delete it.

See [Tasks and Subtasks](/docs/using-kowork/tasks-and-subtasks/) for task basics and [Folders and Files](/docs/using-kowork/folders-and-files/) for choosing the correct folder.

### Kowork repeats the same action

If Kowork warns that it is **Stuck in a loop**, select **Deny** to stop that repeated action. Then give clearer instructions or split the work into smaller steps. Only allow it to continue if you understand the action and expect the repetition.

## A task is waiting for permission

Kowork pauses in **Manual** mode when it needs approval for a sensitive action. Review the action and any file path or other detail shown, then choose:

- **Allow once** to approve only this request.
- **Always allow** to approve matching requests without asking again during the task.
- **Deny** to refuse the action.

If you are unsure, choose **Deny** and ask Kowork to explain why it needs the action or to use another approach. Denying an action can prevent the current plan from finishing, but you can send another message afterward.

If permission requests are being approved without appearing, switch the task from **Auto** to **Manual**. **Auto** automatically approves sensitive actions. Learn more in [Permissions and Safety](/docs/using-kowork/permissions/).

## A connector is not working

Open **Settings → Connectors** and check the status beside the connector:

| Status                           | What to do                                                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Connected**                    | The connector is ready. If a task still cannot use it, send a new message that names the connected service.                                                            |
| **Connecting…**                  | Wait for the connection or sign-in to finish. If it remains there, quit and reopen Kowork, then check the status again.                                                |
| **Off**                          | Turn the connector on.                                                                                                                                                 |
| **Sign-in required**             | Select **Sign in** and finish in your browser. If Kowork cannot open the browser, select **Copy URL**, paste the URL into your browser, and continue there.            |
| **Failed**                       | Read the message shown under the connector, correct the problem if possible, then select **Retry**.                                                                    |
| **Client registration required** | The connector could not complete its setup automatically. Check the connector service's instructions; if it is not supported, remove it and use a different connector. |

For a remote connector, also check your internet connection and confirm that its service is available. If sign-in repeatedly fails, remove the connector, connect it again, and complete the newest sign-in request. Removing a custom connector also removes its saved setup from Kowork, so keep its URL or setup details before removing it.

See [Connectors](/docs/customize/connectors/) for setup guidance.

## Update Kowork

When an **Update available** card appears in the sidebar, select **Update now**. Kowork installs the downloaded update and restarts.

To receive these notices, turn on **Settings → General → Check for updates**. On macOS, **Kowork → Check for Updates…** also checks immediately. Windows does not currently have that application menu; use the update card or install the [latest release](https://github.com/MrHertal/kowork/releases/latest) manually.

If **Update now** fails:

1. Check your internet connection and try again later.
2. Quit Kowork.
3. Download and install the latest official release over your current installation.

## Report a bug

Before reporting, install the latest release and try the relevant steps above. Search [existing issues](https://github.com/MrHertal/kowork/issues) to see whether the problem is already known. If not, open the [Kowork bug report form](https://github.com/MrHertal/kowork/issues/new?template=bug-report.yml).

Include:

- What you expected and what happened instead.
- The exact steps that reproduce the problem.
- Your operating system and Kowork version, if known. On macOS, find the version under **Kowork → About Kowork**.
- The exact error text. For a failed task step, use **Copy error**.
- A screenshot if it helps, after hiding API keys, authorization codes, personal information, and private file contents.

:::tip
There is no log-export feature in Kowork. A clear description, reproducible steps, exact error text, version, and screenshot are the most useful details available in the app.
:::
