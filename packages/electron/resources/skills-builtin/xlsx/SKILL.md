---
name: kowork-xlsx
description: >-
  Create, read, edit, summarize, and style Microsoft Excel (.xlsx) spreadsheets,
  and bridge them to and from CSV. Use whenever the user wants to build a workbook
  from data; read, summarize, or extract cell/range/sheet values; set values or
  formulas; add, format, or compute a column; insert or delete rows or columns;
  style cells (fonts, fills, number formats, widths); add/rename/remove/move/copy
  sheets; inspect a workbook's structure; make a chart; or convert between .xlsx
  and .csv. Triggers on any mention of a spreadsheet, Excel, or a .xlsx/.xlsm/.csv
  file, even without the word "xlsx".
---

# Working with Excel (.xlsx) files

An `.xlsx` is a ZIP of XML parts describing sheets, cells, styles, and formulas.
This skill **creates, reads, edits, styles, and charts** workbooks and **bridges
them to and from CSV**, all with openpyxl (pure Python). Two facts shape every
path: the skill **does not evaluate formulas** (there is no calc engine, so a
formula's result appears only when Excel opens the file), and openpyxl is a
high-level model, so a few exotic parts may not survive a load-and-save
round-trip. Pick the path that matches the request, then follow it.

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
versions. If validation or `present_files` fails, do not claim the workbook is
ready.

## Runtime (obey exactly)

- Run Python as **`kowork-python`** (Kowork puts it on `PATH`; it launches the
  embedded interpreter and works in any shell) — never bare `python`/`python3`.
  Available libraries: `openpyxl`, `et_xmlfile`, and `Pillow` (PIL, for embedding
  images). Import nothing else (no `pandas`, no `numpy`, no other spreadsheet
  engines, no LibreOffice/`soffice`, no system tools). There is no Node path.
- The scripts below live in this skill's `scripts/` directory; paths are relative
  to it. They print clear errors and use non-zero exit codes, and every mutating
  command writes a **new** file (`-o`) — it never edits in place.

## Choose the path

| Request                                                                    | Path                   |
| -------------------------------------------------------------------------- | ---------------------- |
| Make a new workbook                                                        | **Create**             |
| Read / summarize / extract cell, range, or sheet values                    | **Read**               |
| Set values/formulas, insert/delete rows or columns, style, formats, widths | **Edit**               |
| Add/rename/remove/move/copy sheets; inspect structure; import a CSV        | **Sheets & structure** |
| Convert a sheet to CSV, or build a workbook from a CSV                     | **Read** / **Sheets**  |
| Decide between a live formula and a fixed number                           | **Formulas**           |
| Confirm a workbook is sound                                                | **Validate**           |

## Create (openpyxl, Python)

openpyxl is a library, not a CLI, so creating a workbook means running a short
script. Create a **uniquely named task directory with a random suffix inside the
exact pre-approved temporary directory shown in the Bash tool instructions —
never in the user's folder**. Use that task directory (`<task-temp-dir>`) for
every working file. Do not work directly in the pre-approved directory, derive
another path from environment variables, or create a sibling directory.

1. Copy `scripts/create_xlsx.py` into that task directory and edit the
   copy's `build_workbook()` to build the requested content.
2. Run the copy, writing to the path the user asked for:

   ```sh
   kowork-python <task-temp-dir>/create_xlsx.py "/path/the/user/wants/out.xlsx"
   ```

3. Validate the result (see Validate). If it fails, fix and re-run; do not hand
   back an unvalidated file.
4. Keep that working copy in the task directory for the rest of the task: to
   revise a workbook you generated this session, re-edit this script and
   re-run it rather than rebuilding from scratch. (For a workbook you did
   **not** generate here, use the **Edit** path.) The task directory is never
   beside the user's workbook, and the OS reclaims it later.

The template covers a styled header row (bold, filled, centred), data rows,
number formats (currency and percent), live formulas (a per-row `=B*C` and a
`=SUM(...)` total), frozen panes, column widths, a second sheet with a cross-sheet
formula, a bar chart, and an embedded image — each editable in one obvious place.
The default font is **Calibri 11** (change `DEFAULT_FONT_*`). It refuses to write
`.xlsm`/`.xltm`. **Prefer real formulas over Python-computed constants** so the
workbook recalculates in Excel; only write a fixed number when the user explicitly
needs one (see Formulas & computed values).

## Read / extract (openpyxl, Python)

```sh
kowork-python scripts/read_xlsx.py in.xlsx                          # every sheet, as text
kowork-python scripts/read_xlsx.py in.xlsx --sheet Sales            # one sheet (name or 1-based index)
kowork-python scripts/read_xlsx.py in.xlsx --sheet Sales --range A1:D10
kowork-python scripts/read_xlsx.py in.xlsx --format md              # Markdown tables
kowork-python scripts/read_xlsx.py in.xlsx --sheet Sales --format csv -o sheet.csv
kowork-python scripts/read_xlsx.py in.xlsx --data-only              # cached values, not formulas
```

Text (the default) and Markdown read **every sheet**, delimited by a
`===== Sheet: NAME =====` header; `--sheet` limits to one and `--range` reads a
block of a single sheet. `--format csv` exports one sheet (the `--sheet` one, else
the active sheet) and notes on stderr any other sheets it skipped. Reads stream in
read-only mode, so large workbooks stay within bounded memory.

**CSV-export caveat:** by default a cell exports as its **formula text** (e.g.
`=SUM(A1:A3)`), not a computed number — openpyxl does not evaluate formulas. Pass
`--data-only` for cached values, which are present only if Excel last saved the
file (an openpyxl-authored file has none, so formula cells read as empty and the
script warns). See `references/formulas.md`.

## Edit cells / rows / columns (openpyxl, Python)

`scripts/edit_xlsx.py` has one subcommand per operation; each reads an input and
writes a **new** file with `-o` (it never edits in place) and refuses `.xlsm`:

```sh
kowork-python scripts/edit_xlsx.py set in.xlsx -o out.xlsx --sheet Sales --cell B2 42
kowork-python scripts/edit_xlsx.py set in.xlsx -o out.xlsx --sheet Sales --cell E5 "=SUM(E2:E4)"
kowork-python scripts/edit_xlsx.py set in.xlsx -o out.xlsx --sheet Sales --range A2:A4 0
kowork-python scripts/edit_xlsx.py insert-rows in.xlsx -o out.xlsx --sheet Sales --at 2 --count 1
kowork-python scripts/edit_xlsx.py delete-rows in.xlsx -o out.xlsx --sheet Sales --at 5
kowork-python scripts/edit_xlsx.py insert-cols in.xlsx -o out.xlsx --sheet Sales --at C
kowork-python scripts/edit_xlsx.py delete-cols in.xlsx -o out.xlsx --sheet Sales --at 2
kowork-python scripts/edit_xlsx.py style in.xlsx -o out.xlsx --sheet Sales --range A1:E1 --bold --fill 34507A --color FFFFFF --align center
kowork-python scripts/edit_xlsx.py number-format in.xlsx -o out.xlsx --sheet Sales --range C2:C4 --format "$#,##0"
kowork-python scripts/edit_xlsx.py width in.xlsx -o out.xlsx --sheet Sales --col B --width 18
```

`set` writes a **formula** when the value starts with `=` (single `--cell` only —
a formula is never broadcast across a `--range`, because openpyxl copies the text
verbatim without adjusting references); otherwise it lightly coerces to int/float.
Use `--text` to keep a value as a literal string — for IDs, zip codes, phone
numbers, or anything with a leading zero (`007` stays `007`, not `7`). A value
beginning with `-` is read as an option unless you separate it with `--`, e.g.
`set in.xlsx -o out.xlsx --sheet Sales --cell A1 -- -5`. For columns, `--at` and
`--col` accept a letter (`C`) or a 1-based index (`3`). Colors are `RRGGBB` or
`AARRGGBB` hex (a leading `#` is fine); `style` changes only the attributes you
pass and preserves the cell's other styling.

**Formula references are not auto-adjusted.** openpyxl does not rewrite formulas
when you insert or delete rows/columns, so an existing `=SUM(B2:B4)` can end up
covering the wrong range; those commands print a reminder to verify the formulas
(then let Excel recompute on open). See `references/formulas.md`.

## Sheets & structure (openpyxl, Python)

`scripts/sheets.py` owns sheet-level structure and inspection. `info` is
read-only; the rest write a new file with `-o` and refuse `.xlsm`:

```sh
kowork-python scripts/sheets.py info in.xlsx
kowork-python scripts/sheets.py add in.xlsx -o out.xlsx --name Q3 --index 1
kowork-python scripts/sheets.py rename in.xlsx -o out.xlsx --sheet Sheet1 --to Summary
kowork-python scripts/sheets.py remove in.xlsx -o out.xlsx --sheet Draft
kowork-python scripts/sheets.py move in.xlsx -o out.xlsx --sheet Summary --to-index 0
kowork-python scripts/sheets.py copy in.xlsx -o out.xlsx --sheet Template --to Q4
kowork-python scripts/sheets.py from-csv data.csv -o out.xlsx
kowork-python scripts/sheets.py from-csv data.csv -o out.xlsx --into book.xlsx --sheet Imported --text-columns A
```

`info` prints the sheet names (and which is active) and, per sheet, the used range,
dimensions, merged ranges, freeze panes, and chart/image counts, plus any defined
names. `from-csv` builds a new workbook from a CSV, or appends it as a sheet to an
existing workbook with `--into`; pass `--text-columns A,C` (letters or 1-based
indices) to keep those columns as text (IDs, zip codes, leading zeros), while the
rest coerce to numbers. `--sheet` accepts a name or a 1-based index. `copy`
duplicates a sheet's cell values and styles **but not its charts, images, data
validations, or conditional formatting** (an openpyxl limit) and warns when the
source has any.

## Formulas & computed values

openpyxl writes formulas but **never computes them**, and there is no
recalculation engine here (no LibreOffice). A cell holds **either** a formula
**or** a value — openpyxl does not write a cached result alongside a formula. So:

- To show a **live** total, write a formula
  (`set ... --cell E5 "=SUM(E2:E4)"`); Excel computes it when the user opens the
  file. This is the default and usually what you want.
- When the user needs the **number now** (a fixed value baked into the file),
  compute it in Python and write the value instead of a formula.
- Reading computed results needs `--data-only`, and only works if Excel has saved
  the file since the formula was written; an openpyxl-authored file returns empty
  for formula cells.

Full detail, plus formatting conventions, is in `references/formulas.md`.

## Validate (always, after creating or editing)

```sh
kowork-python scripts/validate.py out.xlsx
```

Reopens the workbook with openpyxl, materialises every cell (catching a truncated
or corrupt file), confirms it is a sound `.xlsx` package, and scans for the seven
Excel error values (`#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?`, `#NULL!`, `#NUM!`,
`#N/A`), reporting their `Sheet!Cell` locations. It prints `OK: ...` or
`FAILED: ...` and exits non-zero on failure. Run it on the final file before
handing it back. It cannot recalculate, so it catches an error value only if Excel
already cached it, and it also flags a literally-typed `#REF!`-style string. It is
a soundness/error smoke test, not a content or schema checker (no XSD validation).

## Limitations (state plainly to the user)

- **No formula recalculation.** openpyxl writes formulas but does not compute
  them, and no calc engine is bundled, so a formula's value appears only after
  Excel opens the file. There is no machine-verified "zero errors" beforehand —
  `validate.py` catches only errors Excel already cached.
- **No data analysis.** No pandas/numpy — the skill does basic reads and simple
  by-hand aggregates, not DataFrame-style wrangling.
- **No `.xls` / `.ods` conversion.** openpyxl reads only `.xlsx`/`.xlsm`/`.xltx`;
  legacy `.xls` and OpenDocument files need an office engine that is not bundled.
- **No visual preview or render.** The skill cannot _see_ a spreadsheet or judge a
  chart's appearance — it verifies structure and values by reopening, not by
  looking.
- **Round-trip fidelity.** openpyxl is a high-level model, not a lossless XML
  editor, so saving an edited workbook can drop pivot tables, slicers, form
  controls, VBA, and some chart types. The mutating scripts warn when the input
  holds such parts; edit a copy and verify with `validate.py`.
- **`.xlsm` is read-only.** Macros are never authored or executed, and every
  mutating command refuses to write `.xlsm`/`.xltm` (save a plain `.xlsx`).
