#!/usr/bin/env python3
"""Combine 2+ images into one canvas: a grid, a horizontal row, or a vertical column.

Inputs are NOT rescaled: every cell is as large as the widest and the tallest
input, and each image is centered in its cell. ``--gap`` adds pixels between
cells and ``--background`` (default: white) fills the gaps plus any unused cell
space in a partially-filled grid. The canvas is RGBA, so a transparent
background (``--background '#00000000'``) stays transparent when the output is
PNG; JPEG/BMP flatten onto white via ``imgutil.save_image``.

``--grid CxR`` is columns x rows, filled row-major; more cells than inputs
leaves the trailing cells as background, fewer cells than inputs is an error.
EXIF orientation is baked in before combining, so the layout matches what
viewers show. The output is re-encoded with fresh metadata.

Usage:
    kowork-python combine.py <in...> -o <out> (--grid CxR | --hstack | --vstack) [--gap N] [--background #hex]
"""

from __future__ import annotations

import argparse
import os
import sys

from PIL import Image

from imgutil import (
    ImageError,
    apply_orientation,
    check_distinct_paths,
    check_output_pixels,
    normalize_for_edit,
    open_image,
    parse_color,
    parse_size,
    save_image,
)


def combine(
    images: list[Image.Image],
    cols: int,
    rows: int,
    gap: int,
    background: tuple[int, int, int, int],
) -> Image.Image:
    """Composite the images row-major into a ``cols x rows`` grid of equal cells."""
    cell_w = max(im.width for im in images)
    cell_h = max(im.height for im in images)
    width = cols * cell_w + (cols - 1) * gap
    height = rows * cell_h + (rows - 1) * gap
    check_output_pixels(width, height)
    canvas = Image.new("RGBA", (width, height), background)
    for i, im in enumerate(images):
        col, row = i % cols, i // cols
        x = col * (cell_w + gap) + (cell_w - im.width) // 2
        y = row * (cell_h + gap) + (cell_h - im.height) // 2
        # Alpha-composite every input: paste-with-self-as-mask would square the
        # alpha and premultiply the colors, corrupting translucent pixels.
        canvas.alpha_composite(im.convert("RGBA"), (x, y))
    return canvas


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Combine multiple images into a grid, a row, or a column.")
    ap.add_argument("paths", nargs="+", metavar="in", help="input images, in row-major order")
    ap.add_argument("-o", "--out", dest="output", help="path to write to; the extension picks the format")
    layout = ap.add_mutually_exclusive_group(required=True)
    layout.add_argument("--grid", metavar="CxR", help="arrange into C columns x R rows")
    layout.add_argument("--hstack", action="store_true", help="arrange into a single row, left to right")
    layout.add_argument("--vstack", action="store_true", help="arrange into a single column, top to bottom")
    ap.add_argument("--gap", type=int, default=0, metavar="N", help="pixels between cells (default: 0)")
    ap.add_argument(
        "--background",
        metavar="#hex",
        help="color for gaps and unused cells, #RRGGBB[AA] or a named color (default: white)",
    )
    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    if args.output:
        args.inputs = args.paths
    else:
        if len(args.paths) < 3:
            sys.stderr.write("error: an output path is required; pass -o <out>\n")
            return 1
        if os.path.exists(args.paths[0]):
            sys.stderr.write(
                "error: the first positional path already exists; pass -o <out> "
                "to distinguish the output from the inputs\n"
            )
            return 1
        args.output, *args.inputs = args.paths

    try:
        if len(args.inputs) < 2:
            raise ImageError(f"need at least 2 input images, got {len(args.inputs)}")
        if args.gap < 0:
            raise ImageError(f"--gap must be >= 0, got {args.gap}")
        background = parse_color(args.background) if args.background else (255, 255, 255, 255)
        if args.grid:
            cols, rows = parse_size(args.grid)
            layout_desc = f"{cols}x{rows} grid"
        elif args.hstack:
            cols, rows = len(args.inputs), 1
            layout_desc = "horizontal stack"
        else:
            cols, rows = 1, len(args.inputs)
            layout_desc = "vertical stack"
        if len(args.inputs) > cols * rows:
            raise ImageError(
                f"{len(args.inputs)} images do not fit in a {cols}x{rows} grid ({cols * rows} cell(s))"
            )
        check_distinct_paths(args.output, *args.inputs)
        images = []
        for path in args.inputs:
            im, note = normalize_for_edit(apply_orientation(open_image(path)))
            if note:
                sys.stderr.write(f"note: {note}\n")
            if im.mode == "P":
                im = im.convert("RGBA" if "transparency" in im.info else "RGB")
            images.append(im)
        canvas = combine(images, cols, rows, args.gap, background)
        save_image(canvas, args.output)
    except ImageError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    print(
        f"combined {len(images)} image(s) into {layout_desc} "
        f"({canvas.width}x{canvas.height}), wrote {args.output}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
