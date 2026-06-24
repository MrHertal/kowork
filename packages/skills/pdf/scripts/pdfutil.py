"""Shared helpers for the pdf skill.

Utilities the pdf scripts have in common, kept here so the individual scripts
stay short: opening a PDF with pypdf (``open_reader`` / ``PdfError``), the
``1-3,5`` / ``3,1,2`` page-selection parsers, the in-place-write guard, and the
Markdown-table formatter.
"""

from __future__ import annotations

import os

from pypdf import PdfReader


class PdfError(Exception):
    """A user-facing failure; the pdf scripts print it as ``error: ...`` and exit 1."""


def refuse_inplace(out_path: str, source_path: str) -> None:
    """Refuse to write the result over a file being read from.

    pypdf/pdfplumber round-trips rewrite structure, so writing the output over an
    input risks corrupting the source mid-operation. Callers pass each input they
    read; raises ``PdfError`` on a collision, which the scripts surface as
    ``error: ...``.
    """
    try:
        same = os.path.realpath(out_path) == os.path.realpath(source_path)
    except OSError:
        same = os.path.abspath(out_path) == os.path.abspath(source_path)
    if same:
        raise PdfError(
            f"refusing to write the result over {source_path}; write to a "
            "different output path so the input is not overwritten"
        )


def open_reader(path: str, *, require_pages: bool = True) -> PdfReader:
    """Open a PDF with pypdf, turning the common failures into a clean ``PdfError``.

    A file locked with only an owner password (the empty user password opens it)
    is opened transparently; a real user password is refused with a hint to
    decrypt first. With ``require_pages`` (the default) a zero-page or
    unreadable-page document is rejected; pass ``require_pages=False`` when the
    caller does not need a page count up front.
    """
    if not os.path.isfile(path):
        raise PdfError(f"no such file: {path}")
    try:
        reader = PdfReader(path)
    except Exception as exc:
        raise PdfError(f"cannot read {path}: {exc}")
    if reader.is_encrypted:
        try:
            opened = reader.decrypt("")
        except Exception:
            opened = 0
        if not opened:
            raise PdfError(
                f"{path} is encrypted and needs a password; decrypt it first "
                "with 'pages.py decrypt'"
            )
    if require_pages:
        try:
            count = len(reader.pages)
        except Exception as exc:
            raise PdfError(f"cannot read pages of {path}: {exc}")
        if count < 1:
            raise PdfError(f"{path} has no pages")
    return reader


def parse_page_ranges(spec: str, page_count: int) -> list[int]:
    """Turn a 1-based page selection like ``"1-3,5"`` into 0-based indices.

    The spec is a comma-separated list of items; each item is either a single
    page ``N`` or an inclusive range ``A-B``. Returns the matching page indices
    (0-based, ready to index a page list) in the order written, with duplicates
    removed. Raises ``ValueError`` on malformed syntax or any page outside
    ``1..page_count`` -- callers surface that as an error rather than silently
    clamping, so a typo never reads the wrong pages.
    """
    if page_count < 1:
        raise ValueError("document has no pages")

    indices: list[int] = []
    seen: set[int] = set()
    for raw in spec.split(","):
        item = raw.strip()
        if not item:
            continue
        if "-" in item:
            lo_str, _, hi_str = item.partition("-")
            lo_str, hi_str = lo_str.strip(), hi_str.strip()
            if not (lo_str.isdigit() and hi_str.isdigit()):
                raise ValueError(f"invalid page range: {item!r}")
            lo, hi = int(lo_str), int(hi_str)
            if lo > hi:
                raise ValueError(f"reversed page range: {item!r}")
        elif item.isdigit():
            lo = hi = int(item)
        else:
            raise ValueError(f"invalid page number: {item!r}")
        if lo < 1 or hi > page_count:
            raise ValueError(f"page selection {item!r} out of range 1-{page_count}")
        for page in range(lo, hi + 1):
            idx = page - 1
            if idx not in seen:
                seen.add(idx)
                indices.append(idx)

    if not indices:
        raise ValueError(f"no pages selected from {spec!r}")
    return indices


def parse_page_sequence(spec: str, page_count: int) -> list[int]:
    """Turn an ordered page list like ``"3,1,2"`` into 0-based indices.

    Unlike ``parse_page_ranges`` this preserves order and keeps duplicates: it
    is for operations that lay pages out in an explicit sequence, which may
    repeat or omit pages. Single page numbers only -- no ranges. Raises
    ``ValueError`` on malformed syntax or any page outside ``1..page_count``.
    """
    if page_count < 1:
        raise ValueError("document has no pages")

    indices: list[int] = []
    for raw in spec.split(","):
        item = raw.strip()
        if not item:
            continue
        if not item.isdigit():
            raise ValueError(f"invalid page number: {item!r}")
        page = int(item)
        if page < 1 or page > page_count:
            raise ValueError(f"page {page} out of range 1-{page_count}")
        indices.append(page - 1)

    if not indices:
        raise ValueError(f"no pages given in {spec!r}")
    return indices


def cell(value) -> str:
    """One value as a single-line, pipe-safe string for a Markdown table cell."""
    if value is None:
        return ""
    return " ".join(str(value).split()).replace("|", "\\|")


def format_table(rows) -> str:
    """Render ``rows`` (an iterable of iterables) as a GitHub-style pipe table.

    The first row is the header, followed by a separator line. Ragged rows are
    padded to the widest row. Returns ``""`` when there are no rows.
    """
    cleaned = [[cell(c) for c in row] for row in rows]
    width = max((len(r) for r in cleaned), default=0)
    if width == 0:
        return ""
    for r in cleaned:
        r.extend([""] * (width - len(r)))
    header, *body = cleaned
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * width) + " |",
    ]
    for r in body:
        lines.append("| " + " | ".join(r) + " |")
    return "\n".join(lines)
