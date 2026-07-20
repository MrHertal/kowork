---
name: kowork-pptx
description: >-
  Create, read, edit, and check Microsoft PowerPoint (.pptx) presentations. Use
  whenever the user wants to build a deck or slides from scratch; read,
  summarize, or extract slide titles, body text, tables, or speaker notes; edit
  a slide template by hand; reorder, duplicate, delete, add, or clean up whole
  slides; or check a deck's layout. Triggers on any mention of a presentation,
  deck, slides, slideshow, or a .pptx/.pptm/.potx/.ppsx file, even without the word
  "pptx".
---

# Working with PowerPoint (.pptx) presentations

A `.pptx` is a ZIP of XML parts (Open Packaging Conventions). This skill
**creates** decks with pptxgenjs (Node), **reads** them with python-pptx
(Python), **edits templates** by hand-editing the slide XML (Python), and runs
**slide-level structure** operations on the parts. Because no renderer is
bundled, verification is **structural** — reopen the file and run a layout linter
— not visual; for true WYSIWYG review the user opens the deck in PowerPoint or
Keynote. Pick the path that matches the request, then follow it.

## Runtime (obey exactly)

- Run Python as **`kowork-python`** (Kowork puts it on `PATH`; it launches the
  embedded interpreter and works in any shell) — never bare `python`/`python3`.
  Available libraries: `python-pptx` (imported as `pptx`), `lxml`, `defusedxml`,
  and `Pillow` (PIL, to read an image's pixel size). Import nothing else (no
  `markitdown`, no `pandas`/`numpy`, no LibreOffice/`soffice`, no system tools).
- Run Node as **`kowork-node`** (Kowork puts it on `PATH`; it runs the embedded
  Node and works in any shell) — never bare `node`. The `pptxgenjs` package is
  pre-bundled and resolvable (Kowork sets `NODE_PATH`); just
  `require("pptxgenjs")`. Do not install anything.
- The scripts below live in this skill's `scripts/` directory; paths are relative
  to it. They print clear errors and use non-zero exit codes, and every mutating
  command writes a **new** file (`-o`) — it never edits in place — and refuses to
  write a macro-enabled (`.pptm`/`.potm`/`.ppsm`) output.

## Choose the path

| Request                                                   | Path                 |
| --------------------------------------------------------- | -------------------- |
| Make a new deck / slides                                  | **Create**           |
| Read / summarize / extract slide text, tables, or notes   | **Read**             |
| Change a slide's wording or layout by hand                | **Edit a template**  |
| Reorder, duplicate, delete, add, or clean up whole slides | **Slide operations** |
| Confirm a deck is sound and well laid out                 | **Validate**         |

## Create (pptxgenjs, Node)

pptxgenjs is a library, not a CLI, so creating a deck means running a short
script. Author it as a **working copy in Kowork's runtime-provided temporary
directory — never in the user's folder** — so nothing is left sitting beside
their deck. Use the temporary directory reported by the runtime; never guess,
derive, or hard-code a platform-specific path.

1. Copy `scripts/create_pptx.cjs` into that temporary directory and edit the
   copy to build the requested slides.
2. Run the copy, writing the deck to the path the user asked for:

   ```sh
   kowork-node <temp-dir>/create_pptx.cjs "/path/the/user/wants/out.pptx"
   ```

3. Validate the result (see Validate). If it fails, fix and re-run; do not hand
   back an unvalidated file.
4. Keep that working copy in the temp directory for the rest of the task: to
   revise a deck you generated this session, re-edit this script and re-run it
   rather than rebuilding from scratch. (For a deck you did **not** generate
   here, use the raw-OOXML **Edit a template** path or **Slide operations**.)
   The temp directory is never beside the user's deck, and the OS reclaims it
   later.

The template defaults to **16:9 widescreen** and keeps its whole look in
`COLOR` / `FONT` / `SIZE` design-system constants at the top — edit those once to
restyle every slide. It demonstrates a title slide, bulleted agenda, a stat
callout, a styled table, a column chart, an embedded image, and speaker notes.
The full pptxgenjs API and design conventions (palette, type, layout variety,
spacing) are in `references/create.md`.

## Read / summarize (python-pptx)

```sh
kowork-python scripts/read_pptx.py in.pptx                 # text to stdout, all slides
kowork-python scripts/read_pptx.py in.pptx --slide 3       # one 1-based slide
kowork-python scripts/read_pptx.py in.pptx --format md     # Markdown
kowork-python scripts/read_pptx.py in.pptx --format md -o deck.md
```

Each slide is delimited by a `===== Slide N =====` header (1-based, presentation
order). Per slide it surfaces the **title** (a real title placeholder when
present, otherwise the top-most text box as a fallback), the **body** text, any
**tables** (rendered as Markdown pipe tables), a one-line note for each **chart**
(presence, not a data dump), and the **speaker notes**.

## Edit a template (raw-OOXML, Python)

To change a slide's content, round-trip through the XML: unpack, hand-edit the
slide part, repack, validate. **Unpack into a temporary directory, never the
user's folder**, and pack with `--cleanup` so no unpacked XML is left behind. Do
not string-replace inside the raw `.pptx`.

```sh
kowork-python scripts/unpack.py in.pptx <temp-dir>/work/
# edit <temp-dir>/work/ppt/slides/slideN.xml (and other parts)
kowork-python scripts/pack.py <temp-dir>/work/ "/path/the/user/wants/out.pptx" --cleanup
kowork-python scripts/validate.py "/path/the/user/wants/out.pptx"
```

`unpack.py` pretty-prints the XML parts so a slide is line-editable (pass
`--no-pretty` for verbatim parts). Edit the files directly, or with `lxml` via
the shared `scripts/pptxutil.py` helpers (`parse_xml`, `serialize`,
`qn("a:t")`). Mind the gotchas — bold a header with `b="1"`, one `<a:p>` per line
or list item, edge whitespace needs `xml:space="preserve"`, and write typographic
quotes/dashes as XML numeric entities. See `references/ooxml-patterns.md`. Adding,
removing, or reordering **whole slides** is `slides.py`'s job (below), not hand
editing.

## Slide operations (slides.py)

`scripts/slides.py` works on the packed `.pptx` directly, wiring
`presentation.xml`, the relationships, and `[Content_Types].xml` in lockstep.
`info` is read-only; the rest read an input and write a **new** file with `-o`,
then reopen the result to confirm it is sound:

```sh
kowork-python scripts/slides.py info in.pptx
kowork-python scripts/slides.py reorder in.pptx -o out.pptx --order 3,1,2
kowork-python scripts/slides.py delete in.pptx -o out.pptx --slides 2,4
kowork-python scripts/slides.py duplicate in.pptx -o out.pptx --slide 4 --to 5
kowork-python scripts/slides.py add in.pptx -o out.pptx --layout 1 --to 1
kowork-python scripts/slides.py clean in.pptx -o out.pptx
```

`info` lists each slide's position, part, layout, and a title snippet. `reorder`
takes a permutation of the current positions. `delete` removes slides and sweeps
the parts they alone referenced (media, notes, charts). `duplicate` copies a
slide (without sharing its notes) and inserts the copy (`--to`, default right
after). `add` inserts a blank slide from a layout (1-based index in file order,
or a layout name; `--to`, default end). `clean` drops orphaned slides and their
now-unreferenced parts.

## Validate (always, after creating or editing)

```sh
kowork-python scripts/validate.py out.pptx
```

First a **structure** check: the deck reopens, is a sound OPC package containing
`ppt/presentation.xml`, and every slide and shape materialises (so a truncated or
corrupt part fails rather than hiding). Then a **layout linter** over each slide's
geometry: shapes running **off the slide**, **partial-overlap collisions** (text
layered on a card or a full-bleed background is intentional and not flagged), and
**leftover placeholder text** (`lorem ipsum`, `click to edit`, …) are hard
failures; **unresolved geometry** and **tight margins** (content within 0.25" of
an edge) are reported as info and never fail on their own. It prints `OK: ...` or
`FAILED: ...` and exits non-zero on failure. There is no XSD validation (schemas
are not bundled) and no recalculation or rendering — run it on the final file,
then open the deck in a real viewer for visual QA.

## Limitations (state plainly to the user)

- **No visual render or preview.** The skill cannot produce thumbnails, export to
  PDF or image, or _see_ a slide — that needs LibreOffice, which is not bundled.
  Verification is structural (reopen + layout linter); for true WYSIWYG QA the
  user opens the deck in PowerPoint or Keynote. (A rendered preview may come in a
  future tier.)
- **No `.ppt` / `.odp` / `.key` conversion.** python-pptx reads only the modern
  package formats (`.pptx`/`.pptm`/`.potx`/`.ppsx`); legacy PowerPoint, OpenDocument,
  and Keynote files need an office engine that is not bundled.
- **No SVG→PNG rasterization or react-icons pipeline** (no `sharp`). For icons,
  embed an SVG (renders in modern PowerPoint/Keynote), bring your own PNG (sized
  from its pixel dimensions), or draw a motif with native shapes.
- **`.pptm` is read-only.** Macros are never authored or executed, and every
  mutating command refuses to write a macro-enabled file (`.pptm`/`.potm`/`.ppsm`).
  Save a plain `.pptx`.
- **Created decks use plain text boxes**, not title placeholders, so a slide has
  no "title placeholder"; the Read path accounts for this by falling back to the
  top-most text box as the title.
