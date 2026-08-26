---
title: Providers and Models
description: Connect AI providers, choose a model, and control which models appear in Kowork.
---

A **provider** gives Kowork access to AI services. A **model** is the specific AI you use for a task. Connect at least one provider before choosing its models.

## Connect a provider

1. Select **Settings** in the sidebar.
2. Select **Providers**.
3. Find a provider under **Popular**, or select **Show more providers** for the full list.
4. Select **Connect**.
5. Follow the instructions shown. Depending on the provider, Kowork may ask for an API key, open an authorization page, or offer more than one sign-in method.

After setup, the provider appears under **Connected**, and its models become available in Kowork.

:::note
API keys and account access come from the provider, not Kowork. Follow the provider's instructions if you need to create a key or choose an account.
:::

For a more detailed first-time walkthrough, see [Connect an AI Provider](/docs/getting-started/connect-provider/).

## Choose a model for a task

1. Open or create a task.
2. Select the current model name below the message box.
3. Search or browse by provider, then select a model.

Your choice applies to the task you are working in.

## Choose which models appear

A provider can offer many models. You can keep the model menu focused without disconnecting the provider.

1. Open **Settings** and select **Models**.
2. Search by provider or model name if needed.
3. Turn a model on to show it in the task model menu, or off to hide it.

You can also open the model menu in a task and select **Manage models**.

:::tip
Hiding a model only removes it from the model menu. It does not disconnect its provider.
:::

## Disconnect a provider

1. Open **Settings** and select **Providers**.
2. Under **Connected**, find the provider.
3. Select **Disconnect** beside it.

Its models will no longer be available. A provider configured through environment variables does not show a disconnect action in Kowork.

## Custom providers

The **Custom provider** option is for services that use an OpenAI-compatible API.

1. Open **Settings** and select **Providers**.
2. Under **Popular**, find **Custom provider** and select **Connect**.
3. Enter the provider ID, display name, base URL, and at least one model ID and display name.
4. Add an API key or optional headers if the service requires them.
5. Select **Submit**.

Use the exact connection details supplied by the service. Most people should connect one of the listed providers instead.
