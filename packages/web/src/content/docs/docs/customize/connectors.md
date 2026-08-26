---
title: Connectors
description: Connect Kowork to external services and manage connector access.
---

A **connector** lets Kowork work with an external service, such as Notion, Linear, Atlassian, or monday.com. Behind the scenes, a connector connects Kowork to an **MCP server**. This page uses **connector** for the rest of the instructions.

## Add a connector

1. Select **Settings** in the sidebar.
2. Select **Connectors**.
3. Find a service under **Popular** and select **Connect**.
4. If a browser window opens, sign in to the service and approve the connection.

You can also open the attachment menu beside the task message box and select **Connectors**.

The connector appears under **Connected** with its current status.

:::note
Connecting a service may give Kowork access to information or actions in that service. Review the service's authorization screen before approving access.
:::

## Understand connector status

- **Connected**: The connector is ready.
- **Off**: The connector is saved but disabled.
- **Sign-in required**: Select **Sign in** and complete authorization in your browser.
- **Failed**: Select **Retry**. The error shown below the connector may provide more detail.
- **Client registration required**: The connector could not complete its setup. Check the connector provider's instructions before retrying.

## Turn a connector off or on

1. Open **Settings** and select **Connectors**.
2. Find the connector under **Connected**.
3. Use its switch to turn it off or on.

Turning a connector off keeps it in Kowork so you can enable it again later.

## Remove a connector

1. Open **Settings** and select **Connectors**.
2. Find the connector under **Connected**.
3. Select **Remove** beside it.

To use it again, add it as a new connector.

## Custom connectors

:::caution
Custom connectors are an advanced option. Only use connection details from a service or connector you trust.
:::

To add one, open **Settings** > **Connectors**, find **Custom connector**, and select **Connect**. Choose one of these types:

- **Remote** connects over HTTP. Enter a unique name and the server URL. Add headers only when the connector provider requires them.
- **Local** runs a command on your computer. Enter a unique name and the command with its arguments. Add environment variables only when required.

Select **Submit** to save and connect it. Custom connector names can use lowercase letters, numbers, hyphens, and underscores.
