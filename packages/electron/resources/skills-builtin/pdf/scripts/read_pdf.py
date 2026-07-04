#!/usr/bin/env python3
"""Extract text (and optionally tables) from a PDF with pdfplumber.

pdfplumber reads the PDF's own text and vector layout, so it recovers selectable
text and ruled tables well. Two caveats worth stating to the caller:

  * It cannot read text baked into a scanned image -- that needs OCR, which is
    not bundled -- so image-only pages come back empty. Render such a page to an
    image and read it visually instead.
  * Table detection is layout-dependent. Borderless or irregular tables may
    extract imperfectly; cross-check a rendered page when a table looks wrong.

Default mode emits text page by page; --tables switches to emitting detected
tables as Markdown pipe rows, each labelled by page and table index.

Usage:
    kowork-python read_pdf.py <in.pdf> [-o out.txt] [--tables] [--pages 1-3,5]
"""

from __future__ import annotations

import argparse
import os
import sys

import pdfplumber

from pdfutil import format_table, parse_page_ranges

PAGE_DELIM = "===== Page {n} ====="


def build_text(pdf, indices: list[int]) -> str:
    chunks = []
    for idx in indices:
        text = pdf.pages[idx].extract_text() or ""
        chunks.append(f"{PAGE_DELIM.format(n=idx + 1)}\n{text}")
    return "\n\n".join(chunks) + "\n"


def build_tables(pdf, indices: list[int]) -> tuple[str, int]:
    blocks = []
    for idx in indices:
        for table_no, rows in enumerate(pdf.pages[idx].extract_tables(), start=1):
            body = format_table(rows)
            lines = [f"## Page {idx + 1}, table {table_no}", ""]
            if body:
                lines.append(body)
            blocks.append("\n".join(lines))
    if not blocks:
        return "", 0
    return "\n\n".join(blocks) + "\n", len(blocks)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Extract text and tables from a PDF with pdfplumber.")
    ap.add_argument("input", help="path to the .pdf file")
    ap.add_argument("-o", "--out", help="write output here instead of stdout")
    ap.add_argument("--tables", action="store_true", help="emit detected tables instead of text")
    ap.add_argument("--pages", help="1-based pages to include, e.g. '1-3,5' (default: all)")
    args = ap.parse_args(argv)

    if not os.path.isfile(args.input):
        sys.stderr.write(f"error: no such file: {args.input}\n")
        return 1

    try:
        with pdfplumber.open(args.input) as pdf:
            total = len(pdf.pages)
            if args.pages:
                indices = parse_page_ranges(args.pages, total)
            else:
                indices = list(range(total))

            if args.tables:
                output, table_count = build_tables(pdf, indices)
                summary = f"read {len(indices)} of {total} page(s); found {table_count} table(s)"
            else:
                output = build_text(pdf, indices)
                summary = f"read {len(indices)} of {total} page(s)"
    except ValueError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1
    except Exception as exc:
        sys.stderr.write(f"error: cannot read {args.input}: {exc}\n")
        return 1

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
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
