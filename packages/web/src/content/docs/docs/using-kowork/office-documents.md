---
title: Create Office Documents
description: Create, read, and revise Word, Excel, PowerPoint, and PDF files.
---

Kowork includes built-in document skills for common office formats. You can ask it to create a new file or work with an existing one.

## Supported documents

| Format               | What Kowork can help with                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| Word (`.docx`)       | Create, read, summarize, edit, comment on, and review documents, including tracked changes                |
| Excel (`.xlsx`)      | Create, read, summarize, edit, style, chart, and exchange data with CSV files                             |
| PowerPoint (`.pptx`) | Create, read, summarize, edit, reorganize, and check presentations                                        |
| PDF (`.pdf`)         | Create, read, extract content, combine or rearrange pages, fill forms, and make common page-level changes |

Legacy Word `.doc` files are not supported by the built-in Word skill. Save them as `.docx` first. Some specialized or complex document features may not be preserved by an edit, so keep the original file.

## Create a document

1. Start a task and select the folder where the result should be saved.
2. Describe the document's purpose, audience, structure, and style.
3. Give the output filename and format.
4. Review the delivered file and open it in its usual app.

For example:

> Create `quarterly-review.pptx` in this folder. Use the figures in `results.xlsx`, make eight slides for an executive audience, and include speaker notes with the main talking points.

When Kowork delivers a Word, Excel, PowerPoint, or PDF file, the task shows a document card. In the desktop app, select **Open** to open the saved file.

## Work with an existing document

The most reliable workflow for edits is to put the document in the selected folder and identify it by name. You can also attach `.docx`, `.xlsx`, or `.pptx` documents from the desktop app.

1. Select the document's folder before starting the task, or attach the document with **Add photos or files**.
2. State whether Kowork should inspect, summarize, or change it.
3. For edits, ask for a new output filename unless you intentionally want to replace the original.
4. Open the result in Word, Excel, PowerPoint, a PDF viewer, or another compatible app and check it.

:::caution
Keep an original copy of important documents. Programmatic edits can affect advanced formatting, macros, embedded objects, formulas, or layout in ways that are not obvious from text alone.
:::

## Give precise instructions

Useful details include:

- the source filename and output filename;
- the intended reader or presentation audience;
- required sections, sheets, columns, or slides;
- branding, tone, page size, or visual style;
- whether calculations should use formulas or fixed values;
- content that must remain unchanged.

:::note
Kowork can write spreadsheet formulas, but it does not calculate their results itself. Open the finished workbook in Excel or another spreadsheet app to recalculate and verify them.
:::

PowerPoint files are checked structurally rather than rendered exactly as PowerPoint displays them. Always inspect the final slides for clipping, spacing, fonts, and image placement.

Learn how attachments and selected folders differ in [Folders and Files](/docs/using-kowork/folders-and-files/).
