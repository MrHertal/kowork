#!/usr/bin/env python3
"""Read values from an Excel workbook with openpyxl, as text, Markdown, or CSV.

openpyxl opens the workbook read-only (streaming, so large books stay within
bounded memory) and reads cell values. Two things worth stating to the caller:

  * By default a cell yields its formula text (e.g. "=SUM(A1:A3)"), not a
    computed number -- openpyxl does not evaluate formulas. Pass --data-only to
    read cached values instead, but an openpyxl-authored file has no cache, so
    formula cells come back as None until Excel has opened and saved the file
    (the script warns when it sees that, rather than treating None as empty).
  * text and Markdown read every sheet by default, delimited by a
    "===== Sheet: NAME =====" header; --sheet limits to one. --range applies to
    a single sheet (the --sheet one, else the active sheet). CSV holds a single
    table, so it exports one sheet and names on stderr any others it skipped.

Usage:
    kowork-python read_xlsx.py <in.xlsx> [--sheet NAME] [--range A1:D10] \
        [--format text|md|csv] [--data-only] [-o out]
"""

from __future__ import annotations

import argparse
import csv
import io
import sys

from xlsxutil import XlsxError, format_table, load, parse_range, resolve_sheet

SHEET_DELIM = "===== Sheet: {name} ====="

DATA_ONLY_WARNING = (
    "warning: --data-only returns cached values, and openpyxl never computes "
    "formulas, so formula cells read as None here. An openpyxl-authored file has "
    "no cached values until Excel opens and saves it; drop --data-only to read "
    "the formulas, or open the file in Excel first.\n"
)


def collect_rows(ws, rng):
    """Read a worksheet's values as a list of row lists (whole sheet, or a range)."""
    if rng is None:
        return [list(r) for r in ws.iter_rows(values_only=True)]
    min_col, min_row, max_col, max_row = rng
    return [
        list(r)
        for r in ws.iter_rows(
            min_row=min_row,
            max_row=max_row,
            min_col=min_col,
            max_col=max_col,
            values_only=True,
        )
    ]


def any_uncached(path, collected, rng):
    """Whether a formula cell among ``collected`` has no cached value.

    ``collected`` is the data_only read; a parallel non-data-only read of the
    same cells tells which were formulas, so a formula whose cached value is None
    is reported. Skips the second open entirely when nothing read back as None.
    """
    if not any(v is None for _, rows in collected for row in rows for v in row):
        return False
    formula_wb = load(path, read_only=True, data_only=False)
    try:
        for title, value_rows in collected:
            for frow, vrow in zip(collect_rows(formula_wb[title], rng), value_rows):
                for fval, vval in zip(frow, vrow):
                    if isinstance(fval, str) and fval.startswith("=") and vval is None:
                        return True
    finally:
        formula_wb.close()
    return False


def render_text(rows):
    """Tab-separated plain text, one line per row (None becomes empty)."""
    return "\n".join(
        "\t".join("" if v is None else str(v) for v in row) for row in rows
    )


def build_text_or_md(wb, args, rng):
    # --range (or --sheet) pins the read to a single sheet; otherwise every sheet.
    if args.sheet is not None or rng is not None:
        sheets = [resolve_sheet(wb, args.sheet)]
    else:
        sheets = list(wb.worksheets)

    collected = [(ws.title, collect_rows(ws, rng)) for ws in sheets]

    if args.data_only and any_uncached(args.input, collected, rng):
        sys.stderr.write(DATA_ONLY_WARNING)

    blocks = []
    for title, rows in collected:
        body = format_table(rows) if args.format == "md" else render_text(rows)
        blocks.append(f"{SHEET_DELIM.format(name=title)}\n{body}")

    output = "\n\n".join(blocks) + "\n"
    summary = f"read {len(collected)} of {len(wb.sheetnames)} sheet(s)"
    return output, summary


def build_csv(wb, args, rng):
    ws = resolve_sheet(wb, args.sheet)
    others = [n for n in wb.sheetnames if n != ws.title]
    if others:
        sys.stderr.write(
            f"note: exporting only sheet {ws.title!r}; the workbook also has "
            f"{', '.join(repr(n) for n in others)} (a CSV holds one sheet)\n"
        )

    rows = collect_rows(ws, rng)
    if args.data_only and any_uncached(args.input, [(ws.title, rows)], rng):
        sys.stderr.write(DATA_ONLY_WARNING)

    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(["" if v is None else v for v in row])

    summary = f"read {len(rows)} row(s) from {ws.title!r}"
    return buf.getvalue(), summary


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Extract values from an .xlsx as text, Markdown, or CSV (openpyxl).")
    ap.add_argument("input", help="path to the .xlsx/.xlsm file")
    ap.add_argument("--sheet", help="sheet name or 1-based index (default: all for text/md, active for csv)")
    ap.add_argument("--range", help="cell range like 'A1:D10' on a single sheet (default: the used area)")
    ap.add_argument("--format", choices=["text", "md", "csv"], default="text", help="output format (default: text)")
    ap.add_argument("--data-only", dest="data_only", action="store_true", help="read cached values instead of formulas (see the caveat)")
    ap.add_argument("-o", "--out", help="write output here instead of stdout")
    args = ap.parse_args(argv)

    try:
        wb = load(args.input, read_only=True, data_only=args.data_only)
    except XlsxError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    try:
        rng = parse_range(args.range) if args.range else None
        if args.format == "csv":
            output, summary = build_csv(wb, args, rng)
        else:
            output, summary = build_text_or_md(wb, args, rng)
    except XlsxError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1
    finally:
        wb.close()

    if args.out:
        with open(args.out, "w", encoding="utf-8", newline="") as fh:
            fh.write(output)
        print(f"wrote {len(output)} chars to {args.out}")
    else:
        sys.stdout.write(output)
        if output and not output.endswith("\n"):
            sys.stdout.write("\n")

    sys.stderr.write(summary + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
