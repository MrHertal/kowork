---
name: kowork-docx
description: >-
  Create, edit, read, summarize, and comment on Microsoft Word (.docx)
  documents. Use whenever the user wants to author, change, review, annotate,
  redline, or extract text from a Word document — e.g. building a doc with
  headings, tables, lists, images, headers/footers, or a table of contents;
  making tracked-change edits; adding comments; or converting a Word file to
  Markdown. Triggers on any mention of Word documents or .docx files, even
  without the word "docx".
---

# Working with Word (.docx) documents

A `.docx` is a ZIP of XML parts (Open Packaging Conventions). This skill creates
them with docx-js (Node), and edits/reads/annotates them by manipulating the XML
parts directly (Python). Pick the path that matches the request, then follow it.

## User-facing communication

Follow this procedure silently. Unless the user asks or needs the information to
make a decision, do not mention loading this Skill, templates, scripts, tools,
temporary directories, commands, or validation mechanics. For routine work,
give at most one brief progress update in user-facing terms. By default, the
final response should state the outcome first, identify any delivered file, and
summarize only useful results without an unsolicited offer or follow-up question.

After final validation succeeds for any create or edit, including an in-place
edit, call `present_files` exactly once with every final user-facing output path.
Never call it for read-only or summarization work, and never pass temporary files,
scripts, previews, unpacked directories, validation artifacts, or intermediate
versions. If validation or `present_files` fails, do not claim the document is
ready.

## Runtime (obey exactly)

- Run Python as **`kowork-python`** (Kowork puts it on `PATH`; it launches the
  embedded interpreter and works in any shell) — never bare `python`/`python3`.
  Available libraries: `lxml`, `defusedxml`, `mammoth`, and `Pillow` (only to read
  an image's pixel size — see Create). Import nothing else (no python-docx, numpy,
  pandas).
- Run Node as **`kowork-node`** (Kowork puts it on `PATH`; it runs the embedded
  Node and works in any shell) — never bare `node`. The `docx` package is
  pre-bundled and resolvable (Kowork sets `NODE_PATH`); just `require('docx')`.
  Do not install anything.
- The scripts below live in this skill's `scripts/` directory; paths are
  relative to it. They print clear errors and use non-zero exit codes, and
  every mutating command writes to a **new** output (never editing the input
  in place) and refuses a macro-enabled (`.docm`/`.dotm`) output.

## Choose the path

| Request                                                     | Path                                 |
| ----------------------------------------------------------- | ------------------------------------ |
| Make a new document                                         | **Create**                           |
| Change wording, structure, or formatting of an existing doc | **Edit**                             |
| Summarize / read / extract text                             | **Read**                             |
| Suggest changes as redlines                                 | **Tracked changes** (a kind of Edit) |
| Leave review notes                                          | **Comment**                          |

## Create (docx-js, Node)

docx-js is a library, not a CLI, so creating a document means running a short
script. Create a **uniquely named task directory with a random suffix inside the
exact pre-approved temporary directory shown in the Bash tool instructions —
never in the user's folder**. Use that task directory (`<task-temp-dir>`) for
every working file. Do not work directly in the pre-approved directory, derive
another path from environment variables, or create a sibling directory.

1. Copy `scripts/create_docx.cjs` into that task directory and edit the
   copy's `children` array to build the requested content.
2. Run the copy, writing the document to the path the user asked for:

   ```sh
   kowork-node <task-temp-dir>/create_docx.cjs "/path/the/user/wants/output.docx"
   ```

3. Validate the result (see Validate, below):

   ```sh
   kowork-python scripts/validate.py "/path/the/user/wants/output.docx"
   ```

   If validation fails, repair via the Edit path (unpack → fix XML → validate →
   pack) — do not hand back an unvalidated file.

4. Keep that working copy in the task directory for the rest of the task: to
   revise a document you generated this session, re-edit this script and
   re-run it rather than rebuilding from scratch. (For a document you did
   **not** generate here, use the **Edit** path.) The task directory is never
   beside the user's document, and the OS reclaims it later.

The template covers headings, paragraphs, bulleted and numbered lists, a table,
an inline image, a header, and a footer with page numbers, and sets the page to
**US Letter** (docx-js otherwise defaults to A4 — change `properties.page.size`
to `11906 × 16838` for A4). It also ships Word's default typography out of the
box — Calibri 11pt body with Word's usual paragraph spacing, Calibri Light
headings in Word's blue accent, and a black 28pt title — driven by the `styles`
block and the `FONT` constant at the top of the script; edit the constant to
restyle a document. Tables use fixed DXA widths, set on both the table and each
cell, because percentage widths render unreliably in some viewers. It omits a
table of contents by default (docx-js
can't populate one without Word prompting to update fields on open); add one
only when the user asks. Keep the `.cjs` extension so `require` works in any
project. For numbered lists you must declare a `numbering` config (the template
shows the shape). docx-js needs an image's `width`/`height` in pixels (it does
not auto-size); read them with Pillow (`kowork-python -c "from PIL import Image;
print(Image.open('photo.png').size)"`) rather than guessing.

## Edit (Python)

### Common case: replace text (turnkey)

To change wording, use the bundled helper. It finds the phrase inside a single
run of `word/document.xml` and substitutes it, directly or as a tracked-change redline:

```sh
kowork-python scripts/edit_text.py in.docx --find "OLD" --replace "NEW" -o out.docx
kowork-python scripts/edit_text.py in.docx --find "OLD" --replace "NEW" --tracked \
  --author "Reviewer" -o out.docx
```

With `--tracked` it authors the change as a redline (old text in
`w:del`/`w:delText`, new text in `w:ins`/`w:t`, with a unique revision id), so a
reviewer accepts or rejects it in Word. Replacement text gets typographic
quotes/apostrophes by default (`--no-smart-quotes` keeps them literal). The
phrase must sit within one run; if it spans runs (e.g. partly bold) the helper
says so — target a smaller in-run substring, or take the structural path (its
`unpack.py` merges runs, often rejoining the phrase).

### Structural / complex edits: round-trip by hand

For what the helper can't express — new paragraphs, tables, styles, reordering,
many edits at once — unpack, edit the XML, validate, repack. **Unpack inside the
same unique task directory described above, never the user's folder**, and pack
with `--cleanup` so no unpacked XML is left behind. Do not string-replace inside
the raw `.docx`.

```sh
kowork-python scripts/unpack.py in.docx <task-temp-dir>/work/
# edit <task-temp-dir>/work/word/document.xml (and other parts)
kowork-python scripts/validate.py <task-temp-dir>/work/ --fix
kowork-python scripts/pack.py <task-temp-dir>/work/ "/path/the/user/wants/out.docx" --cleanup
kowork-python scripts/validate.py "/path/the/user/wants/out.docx"
```

`unpack.py` pretty-prints the XML and merges adjacent runs that share `w:rPr`, so
`document.xml` is line-based and a phrase Word split across runs is rejoined into
one `w:t` (pass `--no-merge-runs` / `--no-pretty` for verbatim parts). Edit the
files directly, or with `lxml` via the shared `scripts/oxml.py` helpers
(`parse_xml`, `serialize`, `qn("w:p")`). Mind the gotchas: edge whitespace needs
`xml:space="preserve"`, deleting a whole paragraph needs its paragraph mark
marked deleted too (see patterns), and new parts need content-type + relationship
entries. See `references/ooxml-patterns.md`.

## Read / summarize (mammoth, Python)

```sh
kowork-python scripts/read_docx.py in.docx              # Markdown to stdout
kowork-python scripts/read_docx.py in.docx -o out.md --no-images
kowork-python scripts/read_docx.py in.docx --raw-text   # plain text
```

mammoth maps semantic styles to clean Markdown and shows tracked changes in
their **accepted** form: inserted text appears, deleted text does not. To
inspect redlines, unpack and read `word/document.xml` (look for `w:ins` /
`w:del` / `w:delText`).

## Tracked changes (author redlines)

For a text replacement, the turnkey path is `scripts/edit_text.py --tracked`
(see Edit). To hand-author redlines for anything else, edit
`word/document.xml` (Edit path) and wrap changes:

- Insert: put the new run(s) inside `<w:ins w:id w:author w:date>`.
- Delete: wrap in `<w:del ...>` and store the text in `<w:delText>`, **not**
  `<w:t>`. `validate.py --fix` repairs a `w:t`-in-`w:del` mistake automatically.

`w:id` must be unique across existing `w:ins`/`w:del`; `w:date` is ISO 8601. You
can author redlines but not accept/flatten them (see Limitations).

## Comment

Anchor a comment to the first occurrence of a phrase (within one run), or reply
to an existing comment by id:

```sh
kowork-python scripts/comment.py in.docx \
  --text "the phrase to annotate" \
  --comment "your note" --author "Reviewer" --initials "RV" -o out.docx
# reply to comment 0 (no --text; it attaches to the parent thread)
kowork-python scripts/comment.py in.docx --parent 0 --comment "a reply" -o out.docx
```

This handles all the coordinated edits (range markers + reference in
`document.xml`; the `comments.xml` and `commentsExtended.xml` parts, the latter
carrying thread/`done` metadata via `w14:paraId`/`w15:paraIdParent`; the
content-type Overrides; and the relationships) and splits the run so the comment
covers exactly the matched text. Comment bodies get typographic quotes by default
(`--no-smart-quotes` to keep them literal). If the phrase spans runs, target a
smaller substring in one run.

## Validate (always, after creating or editing)

```sh
kowork-python scripts/validate.py out.docx                   # report only
kowork-python scripts/validate.py work/ --fix                # repair an unpacked dir in place
kowork-python scripts/validate.py in.docx --fix -o out.docx  # repair a packed file to a new file
```

Checks well-formedness, package wiring (content types, root relationship,
`w:document`/`w:body`), dangling relationship ids, tracked-change text
containers, and `xml:space`. Full ECMA-376 schema validation is **not** bundled
(schema redistribution terms are unclear); these structural checks catch the
failures that actually corrupt Word files. Run validate on the final `.docx`
before handing it back.

## Limitations (state plainly to the user)

- **No legacy `.doc`.** Converting old `.doc` to `.docx` needs an Office engine
  Kowork does not bundle. Ask for a `.docx`.
- **No PDF / image export or visual preview.** Rendering needs LibreOffice +
  Poppler, which are not available.
- **Cannot accept/flatten tracked changes.** This skill authors redlines and
  comments; resolving them programmatically needs an Office engine. The user
  accepts/rejects them in Word.
