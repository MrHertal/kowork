#!/usr/bin/env python3
"""Read a presentation's content as plain text or Markdown, for summarising.

python-pptx loads the whole package, so this favours clarity over streaming.
Per slide it surfaces the four things a reader needs -- the title, the body
text, any tables, and the speaker notes -- plus a one-line note for each chart
so a summary can mention it (presence only, never a data dump). Slides are
delimited by a "===== Slide N =====" header in 1-based presentation order;
--slide limits the read to a single slide.

Title resolution copes with two kinds of deck: those with real title
placeholders (template/layout decks) and those assembled from plain text boxes
(no placeholder), where the top-most text box stands in for the title.

Usage:
    kowork-python read_pptx.py <in.pptx> [--format text|md] [--slide N] [-o out]
"""

from __future__ import annotations

import argparse
import sys

from pptxutil import PptxError, format_table, load

SLIDE_DELIM = "===== Slide {n} ====="

# A shape whose geometry is unresolved sorts last when picking the top-most box,
# so a positioned candidate always wins over one with no top.
_UNRESOLVED_TOP = float("inf")


def shape_text(shape) -> str:
    """A shape's text-frame text, stripped, or '' when it carries none."""
    if not shape.has_text_frame:
        return ""
    return shape.text_frame.text.strip()


def oneline(text: str) -> str:
    """Collapse whitespace to a single line, so a title renders on one line."""
    return " ".join(text.split())


def find_title_shape(slide):
    """The slide's title shape, or None.

    Prefer a real title placeholder: template and layout decks expose one via
    ``slide.shapes.title``. Decks assembled from plain text boxes have none, so
    fall back to the top-most text box, which is almost always the visual title.
    Single-character boxes are skipped -- those are decorative glyphs (icon
    letters, ornaments), never a title. Returns None when nothing qualifies, so
    a title is never invented.
    """
    placeholder = slide.shapes.title
    if placeholder is not None:
        return placeholder if shape_text(placeholder) else None
    best, best_top = None, _UNRESOLVED_TOP
    for shape in slide.shapes:
        text = shape_text(shape)
        if len(text) < 2:
            continue
        top = shape.top if shape.top is not None else _UNRESOLVED_TOP
        if best is None or top < best_top:
            best, best_top = shape, top
    return best


def describe_chart(chart) -> str:
    """A one-line acknowledgement of a chart -- type and series names if cheap.

    Deliberately shallow: a reader's summary should mention the chart exists,
    not transcribe its data points.
    """
    try:
        kind = str(chart.chart_type)
    except Exception:
        kind = "unknown type"
    try:
        series = [s.name for s in chart.series if s.name]
    except Exception:
        series = []
    label = f"Chart: {kind}"
    if series:
        label += " (series: " + ", ".join(series) + ")"
    return label


def render_slide(slide, number: int, fmt: str) -> str:
    """One slide's block: title, body, tables, chart notes, then speaker notes."""
    md = fmt == "md"
    out = [SLIDE_DELIM.format(n=number)]

    title_shape = find_title_shape(slide)
    title_id = title_shape.shape_id if title_shape is not None else None
    if title_shape is not None:
        title = oneline(shape_text(title_shape))
        out.append(f"### {title}" if md else f"Title: {title}")

    # Exclude the title by shape id, not object identity: python-pptx returns a
    # fresh wrapper on each access, so the title pulled above is a different
    # object from the one seen while iterating here.
    body = [shape_text(s) for s in slide.shapes if s.shape_id != title_id]
    body = [t for t in body if t]
    if body:
        out.append("")
        out.append("\n\n".join(body))

    for shape in slide.shapes:
        if not shape.has_table:
            continue
        rows = [[c.text for c in row.cells] for row in shape.table.rows]
        table = format_table(rows)
        if table:
            out.append("")
            if not md:
                out.append("Table:")
            out.append(table)

    for shape in slide.shapes:
        if shape.has_chart:
            note = describe_chart(shape.chart)
            out.append("")
            out.append(f"*{note}*" if md else note)

    if slide.has_notes_slide:
        notes = slide.notes_slide.notes_text_frame.text.strip()
        if notes:
            out.append("")
            out.append("**Notes:**" if md else "Notes:")
            out.append(notes)

    return "\n".join(out)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(
        description="Extract a presentation's titles, text, tables, and notes as text or Markdown."
    )
    ap.add_argument("input", help="path to the .pptx file")
    ap.add_argument("--format", choices=["text", "md"], default="text", help="output format (default: text)")
    ap.add_argument("--slide", type=int, help="read only this 1-based slide (default: all slides)")
    ap.add_argument("-o", "--out", help="write output here instead of stdout")
    args = ap.parse_args(argv)

    try:
        prs = load(args.input)
    except PptxError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    total = len(prs.slides)
    if args.slide is not None:
        if args.slide < 1 or args.slide > total:
            sys.stderr.write(f"error: slide {args.slide} out of range 1-{total}\n")
            return 1
        targets = [(args.slide, prs.slides[args.slide - 1])]
    else:
        targets = list(enumerate(prs.slides, start=1))

    blocks = [render_slide(slide, number, args.format) for number, slide in targets]
    output = "\n\n".join(blocks) + "\n"

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(output)
        print(f"wrote {len(output)} chars to {args.out}")
    else:
        sys.stdout.write(output)

    sys.stderr.write(f"read {len(targets)} of {total} slide(s)\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
