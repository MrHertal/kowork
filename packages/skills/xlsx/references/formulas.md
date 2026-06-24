# Formulas, computed values, and authoring conventions

Reference detail deferred from `SKILL.md`. Read this when a request turns on
whether a number should be a live formula or a fixed value, when importing data
that must stay text, or when laying out a financial-style model.

## Formulas vs. computed values

openpyxl writes formulas but never evaluates them, and no recalculation engine is
bundled (no LibreOffice, no pure-Python evaluator). The consequences:

- A cell is **either** a formula **or** a value. openpyxl does not store a cached
  result alongside a formula, so writing `=SUM(A1:A3)` writes the formula text;
  the number appears only when Excel opens and recalculates the file.
- **Prefer formulas.** A formula keeps the workbook dynamic: change an input and
  the totals follow when the file is opened in Excel. Hardcoding a computed number
  freezes it, and it silently goes stale when the inputs change. Default to
  writing the formula.
- **Compute-in-Python escape hatch.** When the user needs a fixed number in the
  file now — a point-in-time snapshot, or a value some downstream tool reads
  without opening Excel — compute it in Python and write the value instead of the
  formula.
- **Reading results.** `read_xlsx.py --data-only` returns cached values, but those
  exist only if Excel has saved the file since the formulas were written. An
  openpyxl-authored file has no cache, so its formula cells read back as empty
  (`None`) — never treat that as zero. `read_xlsx.py` prints a warning when it
  sees this so the emptiness is not mistaken for real data.

## Keeping values as text (`--text` / `--text-columns`)

Numeric-looking strings lose meaning when coerced to numbers: `007` becomes `7`, a
zip code like `02134` loses its leading zero, and a long account or phone number
can turn into scientific notation. Keep such values as text:

- `edit_xlsx.py set ... --text VALUE` forces a single value to a string.
- `sheets.py from-csv ... --text-columns A,C` (column letters or 1-based indices)
  keeps those CSV columns as text while the rest still coerce to numbers.

This matches how Excel itself treats a column formatted as Text. Use it for any
identifier where the digits are a label, not a quantity to compute on.

`from-csv` also never fabricates a formula from imported data: a CSV value that
begins with `=` (e.g. `=1+1`) is kept as the literal text `=1+1`, not turned into
a live formula. To author a real formula, import the data, then set it explicitly
with `edit_xlsx.py set --cell ... "=..."`.

## Inserting / deleting rows and columns

openpyxl shifts cells when you insert or delete rows/columns, but it does **not**
rewrite formula references to follow the shift. A `=SUM(B2:B4)` is not re-pointed
when you insert a row above it, so it can silently cover the wrong range
afterward. After any `insert-rows` / `delete-rows` / `insert-cols` /
`delete-cols`, re-read the affected formulas, fix any that drifted, and let Excel
recompute on open. The edit commands print a reminder to do this.

## Spreadsheet authoring conventions

General best practice for a clean, auditable workbook (not openpyxl-specific):

- **Color-code cell roles** so a reader can tell inputs from results at a glance: a
  distinct colour for hardcoded **inputs/assumptions** (commonly blue), the
  default colour for **formulas** (black), and another for **links to other
  sheets** (commonly green). Apply with `edit_xlsx.py style --color`.
- **Use number formats, not formatted text.** Currency as `$#,##0`, percentages as
  `0.0%`, and negatives in parentheses (e.g. `#,##0;(#,##0)`) so the underlying
  value stays numeric and computable. Keep year labels as text so they are not
  accidentally summed. Apply with `edit_xlsx.py number-format`.
- **Put assumptions in their own labelled cells** and reference them from formulas
  rather than burying a constant inside a formula. One "tax rate" cell that ten
  formulas reference beats the rate typed into ten formulas — change it once, and
  everything updates.
- **Note the source of any hardcoded figure** in an adjacent cell, so a later
  reader knows where a pasted number came from and can refresh it.

Keep it simple: a small, well-labelled set of input cells feeding clearly
formatted formulas is easier to trust — and to edit — than a sheet full of magic
numbers.
