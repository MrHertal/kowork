#!/usr/bin/env python3
"""Validate a PDF by re-opening it and rendering its pages.

PDF has no schema to validate against, so "valid" here means the file re-opens
with a parser and its pages actually rasterise -- which is what catches the real
failure modes (truncated or corrupt files, broken content streams) that make a
PDF unusable. Run this after creating, overlaying, or filling a PDF.

Two layers, weakest to strongest:
  * structure -- pypdf opens the file and it has at least one page;
  * render smoke (default) -- pypdfium2 rasterises the selected pages, exercising
    each page's content stream. ``--no-render`` skips this; it is a weaker check.

An encrypted file that needs a password blocks full validation (decrypt it first
with 'pages.py decrypt'); empty-password files validate normally.

Usage:
    kowork-python validate.py <in.pdf> [--pages 1-3,5] [--no-render]
"""

from __future__ import annotations

import argparse
import os
import sys

import pypdfium2 as pdfium
from pypdf import PdfReader

from pdfutil import parse_page_ranges


def check_structure(path: str) -> int:
    """Open with pypdf and return the page count, or raise ValueError on failure."""
    try:
        reader = PdfReader(path)
    except Exception as exc:
        raise ValueError(f"not a readable PDF: {exc}")
    if reader.is_encrypted:
        try:
            opened = reader.decrypt("")
        except Exception:
            opened = 0
        if not opened:
            raise ValueError("encrypted: needs a password; decrypt it first with 'pages.py decrypt'")
    try:
        count = len(reader.pages)
    except Exception as exc:
        raise ValueError(f"structure unreadable: {exc}")
    if count < 1:
        raise ValueError("has no pages")
    return count


def render_pages(path: str, indices: list[int] | None) -> tuple[int, list[tuple[int, str]]]:
    """Render the given page indices (or all if None); return (checked, failures).

    Each failure is a (page_number, reason) pair. Raises ValueError if the file
    cannot be opened for rendering at all.
    """
    try:
        pdf = pdfium.PdfDocument(path)
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower():
            raise ValueError("encrypted: needs a password; decrypt it first with 'pages.py decrypt'")
        raise ValueError(f"render engine could not open the file: {exc}")
    try:
        targets = list(range(len(pdf))) if indices is None else indices
        failures = []
        for idx in targets:
            try:
                pdf[idx].render(scale=1.0)
            except Exception as exc:
                failures.append((idx + 1, str(exc)))
    finally:
        pdf.close()
    return len(targets), failures


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Validate that a PDF re-opens and renders.")
    ap.add_argument("input", help="path to the .pdf file")
    ap.add_argument("--pages", help="pages to render-check, e.g. '1-3,5' (default: all)")
    ap.add_argument("--no-render", action="store_true", help="structure only; skip the render smoke (weaker check)")
    args = ap.parse_args(argv)

    if not os.path.isfile(args.input):
        sys.stderr.write(f"error: no such file: {args.input}\n")
        return 1

    try:
        page_count = check_structure(args.input)
    except ValueError as exc:
        sys.stderr.write(f"error: {exc}\n")
        sys.stderr.write("FAILED: structure check\n")
        return 1

    if args.no_render:
        print(f"OK: {page_count} page(s), structure only")
        return 0

    if args.pages:
        try:
            indices = parse_page_ranges(args.pages, page_count)
        except ValueError as exc:
            sys.stderr.write(f"error: {exc}\n")
            return 1
    else:
        indices = None

    try:
        checked, failures = render_pages(args.input, indices)
    except ValueError as exc:
        sys.stderr.write(f"error: {exc}\n")
        sys.stderr.write("FAILED: render smoke\n")
        return 1

    if failures:
        for page_no, reason in failures:
            sys.stderr.write(f"error: page {page_no} failed to render: {reason}\n")
        sys.stderr.write(f"FAILED: {len(failures)} of {checked} rendered page(s) failed\n")
        return 1

    if args.pages:
        print(f"OK: {page_count} page(s), {checked} of {page_count} render-checked")
    else:
        print(f"OK: {page_count} page(s), all render")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
