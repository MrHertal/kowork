---
title: Connectors
description: Connect Kowork to external services and manage connector access.
---

A **connector** lets Kowork work with an external service, such as Notion, Linear, Atlassian, or monday.com. Behind the scenes, a connector connects Kowork to an **MCP server**. This page uses **connector** for the rest of the instructions.

Popular built-in connectors include Airtable, Atlassian, Granola, Intercom, Linear, Microsoft 365, Miro, monday.com, Notion, and Todoist.

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

## Intercom

The Intercom connector currently supports US-hosted workspaces (URLs starting with `app.intercom.com`). If your workspace is hosted in the EU (`app.eu.intercom.com`), add it as a [custom connector](#custom-connectors) with the URL `https://mcp.eu.intercom.com/mcp` instead.

## Microsoft 365

The Microsoft 365 connector uses Microsoft's Work IQ service to work with your email, calendar, and files across Microsoft 365.

### Prerequisites

- A **work or school account**. Personal Microsoft accounts are not supported.
- Your organization must enable Work IQ and usage-based billing (Copilot Credits). An administrator can set this up by following Microsoft's [Enable your tenant for Work IQ](https://learn.microsoft.com/microsoft-365/copilot/extensibility/work-iq/enable-work-iq) guide.

### "Need admin approval" during sign-in

If sign-in stops with a **Need admin approval** message (error `AADSTS90094`), this is expected: an administrator of your organization must approve the Kowork app once before anyone in the organization can connect.

Administrators can also approve Kowork for the whole organization in advance by opening this URL, replacing `{tenant-id}` with the organization's tenant ID:

```text
https://login.microsoftonline.com/{tenant-id}/adminconsent?client_id=a74cabf5-5fff-40c3-a9d0-4ab50916c65e
```

After approval, select **Sign in** on the connector again to finish connecting.

### Sending email or changing data doesn't work

Work IQ tenants are read-only by default. Reading email, calendar events, and files works right away, but actions that change data — such as sending email or creating events — are blocked until an administrator enables them for the organization.

To allow these actions, an administrator must:

1. Open the [Microsoft 365 admin center](https://admin.microsoft.com) and select **Agents** > **Tools**.
2. Select **Work IQ MCP** in the tools registry, then open the **Policy** tab.
3. Enable mutation operations for the organization. See Microsoft's [Policy governance for Work IQ MCP](https://learn.microsoft.com/microsoft-365/copilot/extensibility/work-iq/mcp/policy-governance-mcp) guide for details.

Policy changes can take up to 24 hours to apply across the organization.

### Use your own app registration

:::caution
Registering your own Microsoft Entra app is an advanced option for organizations that manage their own app registrations.
:::

Instead of the built-in Microsoft 365 connector, an organization can register its own single-tenant app in Microsoft Entra and connect through a custom connector:

1. Open **Settings** > **Connectors**, find **Custom connector**, and select **Connect**.
2. Choose **Remote**, enter a unique name and the URL `https://workiq.svc.cloud.microsoft/mcp`.
3. Under **Authentication (OAuth)**, enter the app's **Client ID**, leave **Client secret** empty, and set **Scopes** to `api://workiq.svc.cloud.microsoft/WorkIQAgent.Ask offline_access`.
4. Select **Submit** to save and connect.

## Custom connectors

:::caution
Custom connectors are an advanced option. Only use connection details from a service or connector you trust.
:::

To add one, open **Settings** > **Connectors**, find **Custom connector**, and select **Connect**. Choose one of these types:

- **Remote** connects over HTTP. Enter a unique name and the server URL. Add headers only when the connector provider requires them.
- **Local** runs a command on your computer. Enter a unique name and the command with its arguments. Add environment variables only when required.

Select **Submit** to save and connect it. Custom connector names can use lowercase letters, numbers, hyphens, and underscores.
