#!/usr/bin/env python3
"""Validate an .xlsx by reopening it and checking for Excel error values.

The docx/pdf validate.py analog: "valid" here means the file reopens cleanly.
There is no cheap, bundled way to fully schema-check a workbook, and XSD
validation is intentionally NOT done (mirroring the rest of this skill); instead
this is a soundness + error smoke test in two layers:

  1. Structure -- the workbook reopens with openpyxl, it is a sound OOXML zip
     containing xl/workbook.xml, and every cell of every sheet materialises (so a
     truncated or corrupt sheet part surfaces rather than hiding).
  2. Excel error values -- a second pass with data_only=True scans every cell for
     the seven Excel error literals (#VALUE!, #DIV/0!, #REF!, #NAME?, #NULL!,
     #NUM!, #N/A) and reports their Sheet!Coord locations. We cannot recalculate
     formulas (no LibreOffice), but a workbook last saved by Excel carries cached
     values, so this catches pre-existing broken-formula results. An
     openpyxl-authored file has no cached values, so its formula cells read as
     None and scan clean -- no false positives.

It is a soundness/error smoke test, not a content or schema checker. Run it on
the final .xlsx after creating or editing one.

Usage:
    kowork-python validate.py <in.xlsx>
"""

from __future__ import annotations

import argparse
import sys
import zipfile

from xlsxutil import XlsxError, load

ERROR_LITERALS = ("#VALUE!", "#DIV/0!", "#REF!", "#NAME?", "#NULL!", "#NUM!", "#N/A")

# Cap on locations reported per error type, so a pathological sheet stays a sane
# summary rather than thousands of lines.
MAX_REPORT = 20


def structure_check(path):
    """Reopen, confirm the OOXML shape, and materialise every cell.

    Returns ``(sheets, cells)``. Raises on any failure (a bad zip, a missing
    workbook part, or a sheet that will not fully parse) -- the caller turns that
    into a structure-check failure.
    """
    wb = load(path)
    try:
        with zipfile.ZipFile(path) as zf:
            if "xl/workbook.xml" not in zf.namelist():
                raise XlsxError("not an OOXML workbook (missing xl/workbook.xml)")
        cells = 0
        for ws in wb.worksheets:
            for row in ws.iter_rows():
                for c in row:
                    _ = c.value  # force materialisation; a corrupt part raises here
                    cells += 1
        return len(wb.sheetnames), cells
    finally:
        wb.close()


def scan_error_values(wb):
    """Map each Excel error literal found to its list of ``Sheet!Coord`` locations."""
    by_type = {}
    for ws in wb.worksheets:
        for row in ws.iter_rows():
            for c in row:
                value = c.value
                if isinstance(value, str) and value in ERROR_LITERALS:
                    by_type.setdefault(value, []).append(f"{ws.title}!{c.coordinate}")
    return by_type


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Validate that an .xlsx reopens cleanly and has no Excel error values (openpyxl).")
    ap.add_argument("input", help="path to the .xlsx/.xlsm file")
    args = ap.parse_args(argv)

    try:
        sheets, cells = structure_check(args.input)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        sys.stderr.write("FAILED: structure check\n")
        return 1

    try:
        wb = load(args.input, data_only=True)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        sys.stderr.write("FAILED: structure check\n")
        return 1
    try:
        by_type = scan_error_values(wb)
    finally:
        wb.close()

    if by_type:
        for literal, locations in by_type.items():
            shown = ", ".join(locations[:MAX_REPORT])
            extra = f" (+{len(locations) - MAX_REPORT} more)" if len(locations) > MAX_REPORT else ""
            sys.stderr.write(f"error: {literal} at {shown}{extra}\n")
        total = sum(len(v) for v in by_type.values())
        sys.stderr.write(f"FAILED: {total} Excel error value(s)\n")
        return 1

    print(f"OK: {sheets} sheet(s), {cells} cell(s) checked, no Excel error values")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
