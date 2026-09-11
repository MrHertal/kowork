#!/usr/bin/env python3
"""Annotate an image with a watermark logo or a text label.

Two subcommands: ``watermark`` pastes a logo image (PNG with transparency works
best) at a named position, or repeated in a regular grid across the whole image
with ``--tile``; ``text`` draws a label with Pillow's built-in font or a given
.ttf/.otf file. Positions are one of center, top-left, top-right, bottom-left,
bottom-right (default: bottom-right), inset by a margin of ~2% of the image's
smaller dimension.

EXIF orientation is baked into the pixels before annotating, so the named
position matches what viewers see; the output is re-encoded with fresh
metadata. Compositing happens on an RGBA copy (semi-transparent marks and text
blend correctly instead of punching holes); saving to JPEG/BMP flattens onto
white via ``imgutil.save_image``.

Usage:
    kowork-python annotate.py watermark <in> <out> --mark logo.png \\
        [--position P] [--opacity F] [--scale F] [--tile]
    kowork-python annotate.py text <in> <out> --text "..." \\
        [--position P] [--font PATH] [--size N] [--color #hex]
"""

from __future__ import annotations

import argparse
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

from imgutil import (
    ImageError,
    apply_orientation,
    check_distinct_paths,
    normalize_for_edit,
    open_image,
    parse_color,
    save_image,
)

POSITIONS = ("center", "top-left", "top-right", "bottom-left", "bottom-right")
DEFAULT_POSITION = "bottom-right"

# Pillow two-letter text anchors matching POSITIONS (e.g. "rd" = right/descender,
# the bottom-right corner of the text block).
ANCHORS = {
    "center": "mm",
    "top-left": "la",
    "top-right": "ra",
    "bottom-left": "ld",
    "bottom-right": "rd",
}


def check_position(position: str) -> None:
    if position not in POSITIONS:
        raise ImageError(f"invalid position {position!r}; expected one of: {', '.join(POSITIONS)}")


def margin_for(im: Image.Image) -> int:
    """The inset for positioned content: ~2% of the smaller dimension, min 1 px."""
    return max(1, round(min(im.size) * 0.02))


def content_xy(position: str, w: int, h: int, cw: int, ch: int, m: int) -> tuple[int, int]:
    """Top-left paste point for a ``cw x ch`` block at ``position`` in a ``w x h`` image."""
    if position == "center":
        return (w - cw) // 2, (h - ch) // 2
    x = m if position.endswith("left") else w - m - cw
    y = m if position.startswith("top") else h - m - ch
    return x, y


def anchor_xy(position: str, w: int, h: int, m: int) -> tuple[int, int]:
    """The point a text anchor refers to at ``position`` in a ``w x h`` image."""
    if position == "center":
        return w // 2, h // 2
    x = m if position.endswith("left") else w - m
    y = m if position.startswith("top") else h - m
    return x, y


def prepare_mark(args: argparse.Namespace, base: Image.Image) -> Image.Image:
    """Open the mark, scale it relative to the base width, and apply opacity."""
    if not math.isfinite(args.opacity) or not 0 <= args.opacity <= 1:
        raise ImageError(f"--opacity must be between 0 and 1, got {args.opacity:g}")
    if not math.isfinite(args.scale) or not 0 < args.scale <= 1:
        raise ImageError(f"--scale must be in the range (0, 1], got {args.scale:g}")
    mark, note = normalize_for_edit(apply_orientation(open_image(args.mark)))
    if note:
        sys.stderr.write(f"note: {note}\n")
    mark = mark.convert("RGBA")
    tw = max(1, round(base.width * args.scale))
    th = max(1, round(mark.height * tw / mark.width))
    mark = mark.resize((tw, th), Image.Resampling.LANCZOS)
    if args.opacity < 1:
        mark.putalpha(mark.getchannel("A").point(lambda a: round(a * args.opacity)))
    return mark


def do_watermark(base: Image.Image, args: argparse.Namespace) -> str:
    if not args.mark:
        raise ImageError("watermark requires --mark PATH (a logo image; PNG with transparency works best)")
    if not args.tile:
        check_position(args.position)
    mark = prepare_mark(args, base)
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    if args.tile:
        step_x = max(1, round(mark.width * 1.5))
        step_y = max(1, round(mark.height * 1.5))
        count = 0
        y = 0
        while y < base.height:
            x = 0
            while x < base.width:
                overlay.paste(mark, (x, y))
                count += 1
                x += step_x
            y += step_y
        where = f"tiled {count}x"
    else:
        x, y = content_xy(args.position, base.width, base.height, mark.width, mark.height, margin_for(base))
        overlay.paste(mark, (x, y))
        where = args.position
    base.alpha_composite(overlay)
    return f"mark {mark.width}x{mark.height}, {where}, opacity {args.opacity:g}"


def load_font(args: argparse.Namespace, base: Image.Image) -> tuple[ImageFont.FreeTypeFont, int]:
    """Load the requested font, or Pillow's scalable default, at the resolved size."""
    size = args.size if args.size is not None else max(12, round(min(base.size) * 0.04))
    if size < 1:
        raise ImageError(f"--size must be a positive number of pixels, got {size}")
    if args.font is None:
        return ImageFont.load_default(size), size
    if not os.path.isfile(args.font):
        raise ImageError(f"no such font file: {args.font}")
    try:
        return ImageFont.truetype(args.font, size), size
    except Exception as exc:
        raise ImageError(f"cannot load font {args.font}: {exc}") from exc


def do_text(base: Image.Image, args: argparse.Namespace) -> str:
    if args.text is None:
        raise ImageError('text requires --text "..."')
    if not args.text.strip():
        raise ImageError("--text must not be empty")
    check_position(args.position)
    color = parse_color(args.color) if args.color else (255, 255, 255, 255)
    font, size = load_font(args, base)
    # Drawing straight onto the base would replace pixels with the (possibly
    # semi-transparent) fill instead of blending; draw on an overlay and
    # alpha-composite so #RRGGBBAA colors work as expected.
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    x, y = anchor_xy(args.position, base.width, base.height, margin_for(base))
    align = "center" if args.position == "center" else ("left" if args.position.endswith("left") else "right")
    draw.multiline_text((x, y), args.text, font=font, fill=color, anchor=ANCHORS[args.position], align=align)
    base.alpha_composite(overlay)
    return f'text at {args.position}, {size}px, color {args.color or "#FFFFFF"}'


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Annotate an image with a watermark logo or a text label.")
    sub = ap.add_subparsers(dest="command", required=True, metavar="command")

    wp = sub.add_parser("watermark", help="paste a logo at a position, or tiled across the image")
    wp.add_argument("input", help="path to the input image")
    wp.add_argument("output", help="path to write to; the extension picks the format")
    wp.add_argument("--mark", metavar="PATH", help="logo image to paste (required)")
    wp.add_argument(
        "--position",
        default=DEFAULT_POSITION,
        metavar="P",
        help=f"where to place the mark: {', '.join(POSITIONS)} (default: {DEFAULT_POSITION})",
    )
    wp.add_argument("--opacity", type=float, default=1.0, metavar="F", help="mark opacity 0-1 (default: 1.0)")
    wp.add_argument(
        "--scale",
        type=float,
        default=0.25,
        metavar="F",
        help="mark width as a fraction of the image width, (0, 1] (default: 0.25)",
    )
    wp.add_argument(
        "--tile",
        action="store_true",
        help="repeat the mark in a grid across the whole image (ignores --position)",
    )
    wp.set_defaults(func=do_watermark)

    tp = sub.add_parser("text", help="draw a text label")
    tp.add_argument("input", help="path to the input image")
    tp.add_argument("output", help="path to write to; the extension picks the format")
    tp.add_argument("--text", metavar="TEXT", help="the label text (required); a newline draws multiple lines")
    tp.add_argument(
        "--position",
        default=DEFAULT_POSITION,
        metavar="P",
        help=f"where to place the text: {', '.join(POSITIONS)} (default: {DEFAULT_POSITION})",
    )
    tp.add_argument("--font", metavar="PATH", help="a .ttf/.otf font file (default: Pillow's built-in font)")
    tp.add_argument(
        "--size",
        type=int,
        metavar="N",
        help="font size in px (default: 4%% of the smaller image dimension, min 12)",
    )
    tp.add_argument("--color", metavar="#hex", help="text color, #RRGGBB[AA] or a named color (default: white)")
    tp.set_defaults(func=do_text)

    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    try:
        check_distinct_paths(args.output, args.input)
        if args.command == "watermark" and args.mark:
            check_distinct_paths(args.output, args.mark)
        base, note = normalize_for_edit(apply_orientation(open_image(args.input)))
        if note:
            sys.stderr.write(f"note: {note}\n")
        base = base.convert("RGBA")
        detail = args.func(base, args)
        save_image(base, args.output)
    except ImageError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    verb = "watermarked" if args.command == "watermark" else "annotated"
    print(f"{verb} {base.width}x{base.height} -> {args.output} ({detail})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
