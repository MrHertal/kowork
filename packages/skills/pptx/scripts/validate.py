#!/usr/bin/env python3
"""Validate a .pptx: structural soundness plus a geometry-based layout linter.

PowerPoint cannot be invoked and there is no bundled renderer, so this is the
measurable half of visual QA. There is also no bundled PresentationML XSD, so --
as elsewhere in this skill -- no schema validation is attempted; these two layers
are the bundleable substitute:

  1. Structure (hard) -- the deck reopens with python-pptx, is a sound OPC zip
     containing ppt/presentation.xml, and every slide and shape materialises
     (geometry and text are touched) so a truncated or corrupt part surfaces as a
     failure rather than hiding.
  2. Layout linter (geometry + content heuristics) -- per slide, each shape's
     bounding box (resolved through slide/layout/master) is checked for running
     off the slide and for partial collisions with other shapes, and its text is
     scanned for leftover boilerplate. Containment is treated as intentional
     layering (text on a card, content over a full-bleed background), so only
     partial overlaps are flagged. Two checks are informational and never fail a
     deck: shapes whose geometry is unresolved, and content sitting tight to an
     edge.

Run it on the final .pptx after creating or editing one. (A schematic wireframe
view may be added later; this file does structure + linter only.)

Usage:
    kowork-python validate.py <in.pptx>
"""

from __future__ import annotations

import argparse
import re
import sys
import zipfile
from itertools import combinations

from pptxutil import (
    PptxError,
    emu_to_inches,
    load,
    rect_intersection_area,
    rect_within_slide,
    shape_bbox_inches,
)

# Cap on findings reported per category, so a pathological deck stays a summary.
MAX_REPORT = 20

# A partial overlap counts as a collision above this area (square inches). It is
# large enough to ignore incidental slivers -- a text box is routinely taller
# than its glyphs, so its box can graze a neighbour without a visible clash --
# yet far below any real partial overlap.
OVERLAP_AREA_MIN = 0.5

# Slack (inches) for the containment test, absorbing EMU<->inch rounding so a
# shape flush inside another still reads as contained (intentional layering).
CONTAIN_TOL = 0.05

# Content closer than this to a slide edge (inches) is a soft tight-margin note.
EDGE_MARGIN = 0.25

# Shapes covering at least this fraction of the slide are backgrounds, meant to
# bleed to the edges, so they are exempt from the tight-margin note.
FULL_BLEED_FRACTION = 0.90

# Case-insensitive markers of un-filled template/boilerplate content. Word
# boundaries (and multi-word phrases) keep these conservative so real prose --
# e.g. "edit point", "a placeholder image" -- is not flagged.
_MARKER_RE = re.compile(
    "|".join(
        [
            r"\blorem\b",
            r"\bipsum\b",
            r"\btodo\b",
            r"\btbd\b",
            r"click to edit",
            r"click to add",
            r"your text here",
            r"your title here",
            r"text goes here",
            r"sample text",
            r"\bedit me\b",
            r"x{4,}",
            r"\[\s*(?:title|subtitle|text|date|name|company)\s*\]",
            r"\[\s*\]",
        ]
    ),
    re.IGNORECASE,
)


def shape_label(shape) -> str:
    """A human label for a finding: the shape's name, else its type."""
    name = (shape.name or "").strip()
    if name:
        return name
    try:
        return str(shape.shape_type)
    except Exception:
        return "shape"


def shape_text(shape) -> str:
    """All text a shape carries -- text frame or table cells -- for marker scans."""
    if shape.has_text_frame:
        return shape.text_frame.text
    if shape.has_table:
        return "\n".join(cell.text for row in shape.table.rows for cell in row.cells)
    return ""


def structure_check(path: str):
    """Reopen, confirm the OPC shape, and materialise every slide and shape.

    Returns ``(prs, slides, shapes)``. Raises on any failure -- a bad zip, a
    missing presentation part, a missing slide size, or a part that will not
    fully parse -- which the caller turns into a structure-check failure.
    """
    prs = load(path)
    if not zipfile.is_zipfile(path):
        raise PptxError("not a valid OPC package (not a zip)")
    with zipfile.ZipFile(path) as zf:
        if "ppt/presentation.xml" not in zf.namelist():
            raise PptxError("not a presentation (missing ppt/presentation.xml)")
    if prs.slide_width is None or prs.slide_height is None:
        raise PptxError("presentation has no slide size")
    slides = shapes = 0
    for slide in prs.slides:
        slides += 1
        for shape in slide.shapes:
            _ = shape.shape_type
            _ = (shape.left, shape.top, shape.width, shape.height)
            if shape.has_text_frame:
                _ = shape.text_frame.text
            elif shape.has_table:
                for row in shape.table.rows:
                    for cell in row.cells:
                        _ = cell.text
            elif shape.has_chart:
                _ = shape.chart  # forces the chart part to parse
            shapes += 1
    return prs, slides, shapes


def contains(a, b, tol: float = CONTAIN_TOL) -> bool:
    """Whether rectangle ``a`` encloses ``b`` (within ``tol``); both ``(l,t,w,h)``."""
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    return (
        bx >= ax - tol
        and by >= ay - tol
        and bx + bw <= ax + aw + tol
        and by + bh <= ay + ah + tol
    )


def _edge_gap(bbox, slide_w: float, slide_h: float) -> float:
    """Smallest distance from any edge of an in-bounds shape to the slide edge."""
    left, top, w, h = bbox
    return min(left, top, slide_w - (left + w), slide_h - (top + h))


def lint(prs):
    """Run the per-slide geometry and content checks.

    Returns ``(hard, info)`` -- two dicts of category -> list of finding strings.
    ``hard`` findings fail the deck; ``info`` findings are reported but never do.
    """
    slide_w = emu_to_inches(prs.slide_width)
    slide_h = emu_to_inches(prs.slide_height)
    slide_area = slide_w * slide_h
    hard = {"OFF-SLIDE": [], "OVERLAP": [], "PLACEHOLDER": []}
    info = {"UNCHECKED": [], "TIGHT-MARGIN": []}

    for index, slide in enumerate(prs.slides, start=1):
        boxed = []
        for shape in slide.shapes:
            text = shape_text(shape)
            marker = _MARKER_RE.search(text) if text else None
            if marker:
                hard["PLACEHOLDER"].append(
                    f"Slide {index}: {shape_label(shape)} contains {marker.group(0)!r}"
                )

            bbox = shape_bbox_inches(shape)
            if bbox is None:
                info["UNCHECKED"].append(f"Slide {index}: {shape_label(shape)} geometry unresolved")
                continue
            boxed.append((shape, bbox))

            if not rect_within_slide(bbox, slide_w, slide_h):
                hard["OFF-SLIDE"].append(f"Slide {index}: {shape_label(shape)} extends past the slide")
                continue
            if bbox[2] * bbox[3] < FULL_BLEED_FRACTION * slide_area:
                gap = _edge_gap(bbox, slide_w, slide_h)
                if gap < EDGE_MARGIN:
                    info["TIGHT-MARGIN"].append(
                        f'Slide {index}: {shape_label(shape)} sits {gap:.2f}" from a slide edge'
                    )

        for (shape_a, a), (shape_b, b) in combinations(boxed, 2):
            if rect_intersection_area(a, b) > OVERLAP_AREA_MIN and not (contains(a, b) or contains(b, a)):
                hard["OVERLAP"].append(
                    f"Slide {index}: {shape_label(shape_a)} partially overlaps {shape_label(shape_b)}"
                )

    return hard, info


def _report(stream, category: str, findings: list[str]) -> None:
    for line in findings[:MAX_REPORT]:
        stream.write(f"{category} {line}\n")
    if len(findings) > MAX_REPORT:
        stream.write(f"{category} (+{len(findings) - MAX_REPORT} more)\n")


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(
        description="Validate that a .pptx reopens cleanly and check its layout (python-pptx)."
    )
    ap.add_argument("input", help="path to the .pptx file")
    args = ap.parse_args(argv)

    try:
        prs, slides, shapes = structure_check(args.input)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        sys.stderr.write("FAILED: structure check\n")
        return 1

    hard, info = lint(prs)

    for category, findings in info.items():
        _report(sys.stdout, category, findings)
    for category, findings in hard.items():
        _report(sys.stderr, category, findings)

    info_counts = ", ".join(f"{len(v)} {k.lower()}" for k, v in info.items())
    hard_total = sum(len(v) for v in hard.values())
    if hard_total:
        sys.stderr.write(f"FAILED: {hard_total} layout problem(s) ({slides} slide(s), {shapes} shape(s))\n")
        return 1

    print(f"OK: {slides} slide(s), {shapes} shape(s) checked; no layout problems ({info_counts})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
