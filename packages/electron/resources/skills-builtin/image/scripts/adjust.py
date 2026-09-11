#!/usr/bin/env python3
"""Adjust brightness/contrast/saturation/sharpness, or apply one finishing filter.

Factors are floats where 1.0 means "no change" (0.5 halves, 2.0 doubles);
negative factors are rejected. Enhancements always run in a fixed order --
brightness, contrast, color (saturation), sharpness -- regardless of flag
order, and the mutually exclusive filter (--blur / --sharpen / --grayscale)
runs last, so results are reproducible.

EXIF orientation is baked into the pixels first (as in transform.py), and the
output is re-encoded with fresh metadata. An alpha channel is set aside before
the enhancement math and re-attached afterwards, so translucent pixels keep
their exact opacity.

Usage:
    kowork-python adjust.py <in> -o <out> [--brightness F] [--contrast F] [--color F] [--sharpness F]
        [--blur R | --sharpen | --grayscale]
"""

from __future__ import annotations

import argparse
import math
import sys

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

from imgutil import (
    ImageError,
    apply_orientation,
    check_distinct_paths,
    normalize_for_edit,
    open_image,
    save_image,
)

ENHANCERS = (
    ("brightness", ImageEnhance.Brightness),
    ("contrast", ImageEnhance.Contrast),
    ("color", ImageEnhance.Color),
    ("sharpness", ImageEnhance.Sharpness),
)


def check_factor(name: str, value: float) -> None:
    if not math.isfinite(value) or value < 0:
        raise ImageError(f"--{name} must be a number >= 0, got {value:g}")


def apply_adjustments(im: Image.Image, args: argparse.Namespace) -> tuple[Image.Image, list[str]]:
    ops: list[str] = []
    for name, enhancer in ENHANCERS:
        factor = getattr(args, name)
        if factor is None:
            continue
        check_factor(name, factor)
        im = enhancer(im).enhance(factor)
        ops.append(f"{name}={factor:g}")
    if args.blur is not None:
        check_factor("blur", args.blur)
        im = im.filter(ImageFilter.GaussianBlur(radius=args.blur))
        ops.append(f"blur={args.blur:g}")
    elif args.sharpen:
        im = im.filter(ImageFilter.SHARPEN)
        ops.append("sharpen")
    elif args.grayscale:
        im = ImageOps.grayscale(im)
        ops.append("grayscale")
    return im, ops


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        description="Adjust an image's brightness, contrast, color, or sharpness.",
        usage="%(prog)s input -o output [adjustments]",
    )
    ap.add_argument("input", help="path to the input image")
    ap.add_argument("legacy_output", nargs="?", help=argparse.SUPPRESS)
    ap.add_argument("-o", "--out", dest="output", help="path to write to; the extension picks the format")
    ap.add_argument("--brightness", type=float, metavar="F", help="brightness factor, 1.0 = no change")
    ap.add_argument("--contrast", type=float, metavar="F", help="contrast factor, 1.0 = no change")
    ap.add_argument("--color", type=float, metavar="F", help="color (saturation) factor, 1.0 = no change")
    ap.add_argument("--sharpness", type=float, metavar="F", help="sharpness factor, 1.0 = no change")
    filt = ap.add_mutually_exclusive_group()
    filt.add_argument("--blur", type=float, metavar="R", help="Gaussian blur with radius R")
    filt.add_argument("--sharpen", action="store_true", help="apply a sharpen filter")
    filt.add_argument("--grayscale", action="store_true", help="convert to grayscale")
    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    if args.output and args.legacy_output:
        sys.stderr.write("error: pass the output either positionally or with -o, not both\n")
        return 1
    args.output = args.output or args.legacy_output
    if not args.output:
        sys.stderr.write("error: an output path is required; pass -o <out>\n")
        return 1

    requested = [args.brightness, args.contrast, args.color, args.sharpness, args.blur]
    if all(v is None for v in requested) and not args.sharpen and not args.grayscale:
        sys.stderr.write("error: nothing to do; pass at least one adjustment or filter flag\n")
        return 1

    try:
        check_distinct_paths(args.output, args.input)
        im = apply_orientation(open_image(args.input))
        # The enhancement math and filters only handle the common 8-bit modes,
        # so 16-bit/int/float grayscale and CMYK are normalized up front.
        im, norm_note = normalize_for_edit(im)
        if norm_note:
            sys.stderr.write(f"note: {norm_note}\n")
        if im.mode == "P":
            im = im.convert("RGBA" if "transparency" in im.info else "RGB")
        alpha = im.getchannel("A") if "A" in im.getbands() else None
        if alpha is not None:
            im = im.convert("RGB")
        im, ops = apply_adjustments(im, args)
        if alpha is not None:
            im = im.convert("LA" if im.mode == "L" else "RGBA")
            im.putalpha(alpha)
        save_image(im, args.output)
    except ImageError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    print(f"adjusted {', '.join(ops)}, wrote {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
