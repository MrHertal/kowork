---
name: kowork-pdf
description: >-
  Create, read, manipulate, render, and fill PDF (.pdf) files. Use whenever the
  user wants to author a PDF; extract text or tables; merge, split, extract,
  reorder, delete, rotate, or crop pages; read metadata; watermark or
  stamp; encrypt or decrypt; render a page to an image for preview or visual QA;
  or fill a form — both interactive (AcroForm) fields and flat printed forms via
  text overlay. Triggers on any mention of PDF or .pdf files, even without the
  word "pdf".
---

# Working with PDF (.pdf) files

A PDF is fixed-layout binary content (objects and content streams), not a
reflowable document. This skill **creates** PDFs with reportlab and
**reads / manipulates / renders / fills** them with pypdf, pdfplumber and
pypdfium2 — all Python. Pick the path that matches the request, then follow it.

## Runtime (obey exactly)

- Run Python as **`kowork-python`** (Kowork puts it on `PATH`; it launches the
  embedded interpreter and works in any shell) — never bare `python`/`python3`.
  Available libraries: `pypdf`, `pdfplumber`, `reportlab`, `Pillow`,
  `pypdfium2`. Import nothing else (no PyMuPDF/fitz, pdf2image, pikepdf, or
  system tools like pdftoppm/qpdf/tesseract).
- Creating a PDF uses **reportlab** (Python) — there is no Node path for pdf.
- The scripts below live in this skill's `scripts/` directory; paths are
  relative to it. They print clear errors and use non-zero exit codes.

## Choose the path

| Request                                                                   | Path                                  |
| ------------------------------------------------------------------------- | ------------------------------------- |
| Make a new PDF                                                            | **Create**                            |
| Summarize / read / extract text or tables                                 | **Read**                              |
| Merge, split, extract, reorder, delete, rotate, crop; metadata; watermark | **Page operations**                   |
| Password-protect or remove a password                                     | **Page operations** (encrypt/decrypt) |
| See a page / preview / visual QA / "show me page N"                       | **Render to image**                   |
| Fill a form that has real fillable fields                                 | **Interactive form**                  |
| Fill a flat (printed) form                                                | **Flat form (overlay)**               |
| Confirm a PDF is sound                                                    | **Validate**                          |

## Create (reportlab, Python)

reportlab is a library, not a CLI, so creating a PDF means running a short
script. Author it as a **working copy in Kowork's runtime-provided temporary
directory — never in the user's folder**. Use the temporary directory reported
by the runtime; never guess, derive, or hard-code a platform-specific path.

1. Copy `scripts/create_pdf.py` into that temporary directory and edit the
   copy's `build_story()` to build the requested content.
2. Run the copy, writing to the path the user asked for:

   ```sh
   kowork-python <temp-dir>/create_pdf.py "/path/the/user/wants/out.pdf"
   ```

3. Validate the result (see Validate). If it fails, fix and re-run; do not hand
   back an unvalidated file.
4. Keep that working copy in the temp directory for the rest of the task: to
   revise a PDF you generated this session, re-edit this script and re-run it
   rather than rebuilding from scratch. The temp directory is never beside the
   user's file, and the OS reclaims it later.

The template covers a document title, two heading levels, paragraphs, a bulleted
and a numbered list, a styled table, an inline image, and a "Page N of M"
footer, at **US Letter** (swap `LETTER` for `A4` from `reportlab.lib.pagesizes`).
Pillow is bundled, so a real image can be embedded with `Image("photo.png")` and
its `width`/`height` are optional (reportlab reads the file's own dimensions).

## Read / extract (pdfplumber, Python)

```sh
kowork-python scripts/read_pdf.py in.pdf                      # text, per page, to stdout
kowork-python scripts/read_pdf.py in.pdf -o out.txt --pages 1-3,5
kowork-python scripts/read_pdf.py in.pdf --tables             # detected tables as Markdown
```

Text comes out page by page with a `===== Page N =====` delimiter. `--tables`
switches to emitting detected tables as Markdown pipe rows, labelled by page and
table index (a mode switch, not added to the text). `--pages` takes a 1-based
selection like `1-3,5`. Scanned or image-only pages yield no text (no OCR) —
render and read them visually. Angled/rotated text (e.g. a watermark) may not
extract as a contiguous string — render to confirm.

## Page operations (pypdf, Python)

`scripts/pages.py` has one subcommand per operation:

```sh
kowork-python scripts/pages.py metadata in.pdf
kowork-python scripts/pages.py merge a.pdf b.pdf -o out.pdf
kowork-python scripts/pages.py split in.pdf outdir/ [--pages 1-3,5]
kowork-python scripts/pages.py extract in.pdf -o out.pdf --pages 1-3,5
kowork-python scripts/pages.py delete in.pdf -o out.pdf --pages 2,4
kowork-python scripts/pages.py reorder in.pdf -o out.pdf --order 3,1,2
kowork-python scripts/pages.py rotate in.pdf -o out.pdf --degrees 90 [--pages 1-3]
kowork-python scripts/pages.py crop in.pdf -o out.pdf --box L,B,R,T [--pages 1]
kowork-python scripts/pages.py watermark in.pdf -o out.pdf --stamp stamp.pdf [--pages 1-3] [--under]
kowork-python scripts/pages.py encrypt in.pdf -o out.pdf --password USER [--owner OWNER]
kowork-python scripts/pages.py decrypt in.pdf -o out.pdf --password PW
```

`--pages` selections use `1-3,5` (1-based). `reorder --order` is an explicit
sequence and may repeat or omit pages. `rotate --degrees` is a multiple of 90,
applied relative to the page's current rotation. `crop --box` is `L,B,R,T` in
PDF points (origin bottom-left). `watermark` overlays the stamp PDF's first page
on top of each page (`--under` puts it behind); transparency comes from the
stamp itself, so make a see-through stamp with `create_pdf.py`. `encrypt` uses
AES-256 and `--owner` defaults to the user password. **An encrypted input to any
other operation fails** — run `decrypt` first.

## Render to image (pypdfium2, Python)

```sh
kowork-python scripts/render.py in.pdf outdir/ [--pages 1-3,5] [--dpi 150 | --scale 2.0] [--format png|jpeg] [--jpeg-quality 85]
```

Writes `page_NNN.png` (or `.jpg`). Default: all pages, PNG, 150 DPI (`--dpi` and
`--scale` are mutually exclusive; 1.0 scale = 72 DPI).

**Critical — to actually _see_ a page you must Read the produced image file.**
The shell returns text only, so writing the PNG does not put it in context;
after rendering, use the **Read tool** on the file so the image enters context
(needs a vision-capable model). This is the "show me page N" / visual-QA path,
and how to confirm form-fill placement. Render around 150 DPI — very high DPI is
wasted because large images are downscaled before the model sees them. For text
and QA prefer PNG (JPEG is lossy and can be larger on text-heavy pages).

## Fill an interactive (AcroForm) form (pypdf, Python)

First decide which kind of form it is:

```sh
kowork-python scripts/forms.py inspect in.pdf
```

If it reports fillable fields, dump them, author a values JSON, fill, validate:

```sh
kowork-python scripts/forms.py fields in.pdf -o fields.json
# write values.json: a {"field_id": value, ...} map using the values fields.json shows
kowork-python scripts/forms.py fill in.pdf values.json -o out.pdf
kowork-python scripts/validate.py out.pdf
```

`fields` lists each field's id, type (text/checkbox/radio/choice), page, rect,
current value, and the legal values (checkbox `on`/`off`, radio/choice
`options`). `fill` validates every value before writing — an unknown id or an
illegal checkbox/radio/choice value is an error and nothing is written — and
sets the AcroForm NeedAppearances flag so viewers show the values. Filled values
live in appearance streams, so `read_pdf.py` (text extraction) will **not** show
them. Verify the result one of two ways: `forms.py fields` on the output, which
reads the authoritative stored `/V` for each field (the reliable check); or
`render.py`, which initialises the form environment so the filled fields appear
in the image (Read it to confirm placement). If `inspect` reports no fillable
fields, it is a flat form — use the overlay path.

## Fill a flat (non-interactive) form (overlay, Python)

Flat forms are just printed labels and lines with no fields, so "filling" means
stamping text onto the page at the right spots. Outline:

```sh
kowork-python scripts/forms.py structure in.pdf -o structure.json   # labels, lines, tick boxes (PDF points)
kowork-python scripts/render.py in.pdf prev/ --pages 1               # render, then Read prev/page_001.png to see the layout
# author fields.json describing the boxes + text to stamp (see references/forms.md)
kowork-python scripts/forms.py check-boxes fields.json              # validate the boxes first
kowork-python scripts/forms.py overlay in.pdf fields.json -o out.pdf
kowork-python scripts/forms.py preview-boxes in.pdf fields.json prev/  # render with boxes drawn; Read to verify
kowork-python scripts/validate.py out.pdf
```

The full procedure, the two coordinate systems, and the `fields.json` schema are
in **`references/forms.md`** — read it before authoring a `fields.json`.

## Validate (always, after creating, overlaying, or filling)

```sh
kowork-python scripts/validate.py out.pdf            # structure + render every page
kowork-python scripts/validate.py out.pdf --pages 1-3
kowork-python scripts/validate.py out.pdf --no-render # structure only (weaker)
```

Opens with pypdf (does it parse? at least one page?) and renders each selected
page with pypdfium2 (exercising its content stream). This catches the real
failure modes — truncated or corrupt files, unrenderable pages — and reports an
encrypted file. It is a soundness smoke test, not a content/pixel checker. Run
it on the final PDF before handing it back.

## Limitations (state plainly to the user)

- **No OCR.** Scanned or image-only PDFs have no extractable text; you can render
  a page and read it visually, but a searchable text layer cannot be added.
- **No Office / legacy conversion.** Cannot convert PDF↔Word/Excel or open a
  `.doc`/`.docx` here (needs an office engine, not bundled).
- **No reflow text editing.** PDF is fixed-layout; existing body text cannot be
  re-flowed or edited in place. You can overlay text, watermark, fill forms, or
  recreate the document — not edit the prose.
