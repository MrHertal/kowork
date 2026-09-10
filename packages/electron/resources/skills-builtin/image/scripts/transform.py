#!/usr/bin/env python3
"""Geometric transforms: resize, crop, rotate, flip (one image in, one out).

EXIF orientation is baked into the pixels before transforming, so the geometry
you get matches what viewers show. The output is then re-encoded with fresh
metadata: input EXIF is NOT carried over, which also means the stale
Orientation tag cannot survive into the output (its rotation is now the
pixels'). Palette (P-mode) images are promoted to RGB/RGBA so resampling
produces true colors instead of blended palette indices.

Crop boxes are pixel coordinates with the origin at the TOP-LEFT corner (this
differs from the pdf skill's point coordinates, whose origin is bottom-left).

Notes (aspect-ratio changes, clamped crop boxes) go to stderr; stdout carries a
single summary line.

Usage:
    kowork-python transform.py resize <in> <out> (--size WxH | --width W | --height H | --percent P | --max WxH)
    kowork-python transform.py crop <in> <out> --box L,T,R,B
    kowork-python transform.py rotate <in> <out> --degrees D [--expand]
    kowork-python transform.py flip <in> <out> (--horizontal | --vertical)
"""

from __future__ import annotations

import argparse
import math
import sys

from PIL import Image

from imgutil import (
    ImageError,
    apply_orientation,
    check_distinct_paths,
    check_output_pixels,
    normalize_for_edit,
    open_image,
    parse_size,
    save_image,
)


def prepare(path: str) -> Image.Image:
    """Open an image, bake in its EXIF orientation, and promote P-mode to RGB(A)."""
    im = apply_orientation(open_image(path))
    if im.mode == "P":
        im = im.convert("RGBA" if "transparency" in im.info else "RGB")
    return im


def positive_int(value: str) -> int:
    try:
        n = int(value)
    except ValueError:
        raise argparse.ArgumentTypeError(f"{value!r} is not an integer")
    if n < 1:
        raise argparse.ArgumentTypeError(f"{value!r} is not a positive integer")
    return n


def target_size(im: Image.Image, args: argparse.Namespace) -> tuple[int, int, str | None]:
    """Resolve the resize flags into ``(width, height, note)``."""
    w, h = im.size
    if args.size is not None:
        tw, th = parse_size(args.size)
        note = None
        if w * th != tw * h:
            note = f"--size changed the aspect ratio ({w}x{h} -> {tw}x{th})"
        return tw, th, note
    if args.width is not None:
        return args.width, max(1, round(h * args.width / w)), None
    if args.height is not None:
        return max(1, round(w * args.height / h)), args.height, None
    if args.percent is not None:
        if not math.isfinite(args.percent) or args.percent <= 0:
            raise ImageError(f"--percent must be a positive number, got {args.percent:g}")
        scale = args.percent / 100
        return max(1, round(w * scale)), max(1, round(h * scale)), None
    # --max: fit inside the box, never upscale.
    bw, bh = parse_size(args.max_size)
    scale = min(bw / w, bh / h, 1.0)
    return max(1, round(w * scale)), max(1, round(h * scale)), None


def parse_box(spec: str) -> tuple[int, int, int, int]:
    """Parse a ``L,T,R,B`` pixel box (origin top-left)."""
    parts = spec.split(",")
    if len(parts) != 4:
        raise ImageError(f"invalid box {spec!r}; expected L,T,R,B in pixels, e.g. 10,10,100,80")
    try:
        left, top, right, bottom = (int(p.strip()) for p in parts)
    except ValueError:
        raise ImageError(f"invalid box {spec!r}; expected L,T,R,B in pixels, e.g. 10,10,100,80")
    if left >= right or top >= bottom:
        raise ImageError(f"invalid box {spec!r}; need L < R and T < B")
    return left, top, right, bottom


def clamp_box(box: tuple[int, int, int, int], w: int, h: int) -> tuple[tuple[int, int, int, int], str | None]:
    """Clamp a box to the image bounds; error if it lies entirely outside."""
    left, top, right, bottom = box
    clamped = (max(0, left), max(0, top), min(w, right), min(h, bottom))
    cl, ct, cr, cb = clamped
    if cl >= cr or ct >= cb:
        raise ImageError(f"crop box {left},{top},{right},{bottom} is outside the image ({w}x{h})")
    note = None
    if clamped != box:
        note = f"crop box clamped to the image bounds: {cl},{ct},{cr},{cb}"
    return clamped, note


def do_resize(im: Image.Image, args: argparse.Namespace) -> tuple[Image.Image, str | None, str]:
    tw, th, note = target_size(im, args)
    check_output_pixels(tw, th)
    out = im.resize((tw, th), Image.Resampling.LANCZOS)
    return out, note, f"resized {im.width}x{im.height} -> {tw}x{th}"


def do_crop(im: Image.Image, args: argparse.Namespace) -> tuple[Image.Image, str | None, str]:
    box, note = clamp_box(parse_box(args.box), im.width, im.height)
    check_output_pixels(box[2] - box[0], box[3] - box[1])
    out = im.crop(box)
    return out, note, f"cropped {im.width}x{im.height} -> {out.width}x{out.height} at ({box[0]},{box[1]})"


def do_rotate(im: Image.Image, args: argparse.Namespace) -> tuple[Image.Image, str | None, str]:
    degrees = args.degrees
    if not math.isfinite(degrees):
        raise ImageError("--degrees must be a finite number")
    note = None
    if "A" in im.getbands():
        im = im.convert("RGBA")
        fill: tuple | int = (0, 0, 0, 0)
    elif im.mode == "CMYK":
        fill = (0, 0, 0, 0)  # white in CMYK is "no ink"
    elif im.mode in ("I;16", "I;16B", "I;16L", "I", "F"):
        if degrees % 90 == 0:
            fill = 65535  # multiples of 90 take Pillow's exact transpose path
        else:
            # Pillow's bilinear/bicubic affine path mis-scales I;16/I/F samples
            # (a uniform 50% gray comes out doubled), so normalize to 8-bit
            # grayscale before an arbitrary-angle rotate.
            im, note = normalize_for_edit(im)
            fill = 255
    else:
        if im.mode != "RGB":
            im = im.convert("RGB")
        fill = (255, 255, 255)
    if args.expand:
        # The rotated bounding box, computed up front so an oversized expanded
        # canvas is refused before any allocation.
        radians = math.radians(degrees)
        cos, sin = abs(math.cos(radians)), abs(math.sin(radians))
        check_output_pixels(
            math.ceil(im.width * cos + im.height * sin),
            math.ceil(im.width * sin + im.height * cos),
        )
    out = im.rotate(degrees, resample=Image.Resampling.BICUBIC, expand=args.expand, fillcolor=fill)
    expanded = " (canvas expanded)" if args.expand else ""
    return out, note, f"rotated {degrees:g} degrees{expanded}, {im.width}x{im.height} -> {out.width}x{out.height}"


def do_flip(im: Image.Image, args: argparse.Namespace) -> tuple[Image.Image, str | None, str]:
    if args.horizontal:
        return im.transpose(Image.Transpose.FLIP_LEFT_RIGHT), None, "flipped horizontally"
    return im.transpose(Image.Transpose.FLIP_TOP_BOTTOM), None, "flipped vertically"


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Resize, crop, rotate, or flip an image.")
    sub = ap.add_subparsers(dest="command", required=True, metavar="command")

    rp = sub.add_parser("resize", help="resize with LANCZOS resampling")
    rp.add_argument("input", help="path to the input image")
    rp.add_argument("output", help="path to write to; the extension picks the format")
    size = rp.add_mutually_exclusive_group(required=True)
    size.add_argument("--size", metavar="WxH", help="exact output size (may change the aspect ratio)")
    size.add_argument("--width", type=positive_int, metavar="W", help="output width; height follows the aspect ratio")
    size.add_argument("--height", type=positive_int, metavar="H", help="output height; width follows the aspect ratio")
    size.add_argument("--percent", type=float, metavar="P", help="scale both dimensions by P percent")
    size.add_argument(
        "--max",
        dest="max_size",
        metavar="WxH",
        help="fit inside WxH preserving the aspect ratio; never upscales",
    )
    rp.set_defaults(func=do_resize)

    cp = sub.add_parser("crop", help="crop to a pixel box, origin top-left")
    cp.add_argument("input", help="path to the input image")
    cp.add_argument("output", help="path to write to; the extension picks the format")
    cp.add_argument("--box", required=True, metavar="L,T,R,B", help="crop box in pixels, e.g. 10,10,100,80")
    cp.set_defaults(func=do_crop)

    rotp = sub.add_parser("rotate", help="rotate by an arbitrary angle (multiples of 90 are exact)")
    rotp.add_argument("input", help="path to the input image")
    rotp.add_argument("output", help="path to write to; the extension picks the format")
    rotp.add_argument("--degrees", type=float, required=True, metavar="D", help="counter-clockwise angle")
    rotp.add_argument(
        "--expand",
        action="store_true",
        help="grow the canvas to fit the rotated image (default: keep the original size and crop)",
    )
    rotp.set_defaults(func=do_rotate)

    fp = sub.add_parser("flip", help="mirror an image horizontally or vertically")
    fp.add_argument("input", help="path to the input image")
    fp.add_argument("output", help="path to write to; the extension picks the format")
    direction = fp.add_mutually_exclusive_group(required=True)
    direction.add_argument("--horizontal", action="store_true", help="mirror left-right")
    direction.add_argument("--vertical", action="store_true", help="mirror top-bottom")
    fp.set_defaults(func=do_flip)

    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    try:
        check_distinct_paths(args.output, args.input)
        im = prepare(args.input)
        out, note, summary = args.func(im, args)
        save_image(out, args.output)
    except ImageError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    if note:
        sys.stderr.write(f"note: {note}\n")
    print(f"{summary}, wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
