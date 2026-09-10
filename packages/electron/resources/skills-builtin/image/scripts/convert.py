#!/usr/bin/env python3
"""Re-encode an image into another format (the target comes from the output extension).

This is the skill's "make it a JPEG/WebP/PNG" path: pixel content is decoded
and re-encoded, nothing else changes. EXIF orientation is NOT applied -- the
tag travels with the metadata, so viewers keep displaying the picture the same
way up.

Metadata (EXIF, ICC profile, DPI) is carried over when the output format
supports it (EXIF: JPEG/PNG/WebP/TIFF; ICC: JPEG/PNG/TIFF/WebP; DPI: JPEG/PNG);
``--strip-metadata`` drops all three. Images with alpha are flattened onto
``--background`` (default white) for formats without an alpha channel (JPEG,
BMP). An animated input (e.g. GIF) converts to its first frame only, with a
note on stderr; notes never pollute the one-line stdout summary.

Usage:
    kowork-python convert.py <in> <out> [--quality N] [--strip-metadata] [--background #hex]
"""

from __future__ import annotations

import argparse
import os
import sys

from PIL import Image

from imgutil import (
    ImageError,
    check_distinct_paths,
    format_for_path,
    human_size,
    open_image,
    parse_color,
    prepare_for_format,
)

EXIF_FORMATS = ("JPEG", "PNG", "WEBP", "TIFF")
ICC_FORMATS = ("JPEG", "PNG", "TIFF", "WEBP")
DPI_FORMATS = ("JPEG", "PNG")
QUALITY_FORMATS = ("JPEG", "WEBP", "AVIF")


def save_with_metadata(
    im: Image.Image,
    path: str,
    *,
    quality: int | None,
    background: tuple[int, int, int, int],
    strip_metadata: bool,
) -> str:
    """``imgutil.save_image`` plus metadata passthrough (which it does not do).

    Captures metadata before ``prepare_for_format`` runs: normalization and
    flattening build a fresh image whose ``info`` is empty.
    """
    fmt = format_for_path(path)
    exif = im.info.get("exif")
    icc = im.info.get("icc_profile")
    dpi = im.info.get("dpi")
    im, notes = prepare_for_format(im, fmt, background)
    for note in notes:
        sys.stderr.write(f"note: {note}\n")
    kwargs: dict = {}
    if quality is not None and fmt in QUALITY_FORMATS:
        kwargs["quality"] = quality
    if not strip_metadata:
        if exif and fmt in EXIF_FORMATS:
            kwargs["exif"] = exif
        if icc and fmt in ICC_FORMATS:
            kwargs["icc_profile"] = icc
        if dpi and fmt in DPI_FORMATS:
            kwargs["dpi"] = dpi
    try:
        im.save(path, fmt, **kwargs)
    except Exception as exc:
        raise ImageError(f"cannot write {path}: {exc}")
    return fmt


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        description="Re-encode an image into the format implied by the output extension."
    )
    ap.add_argument("input", help="path to the input image")
    ap.add_argument("output", help="path to write to; the extension picks the format")
    ap.add_argument("--quality", type=int, metavar="N", help="lossy quality 1-100 (JPEG, WebP, AVIF)")
    ap.add_argument(
        "--strip-metadata",
        action="store_true",
        help="drop EXIF, ICC profile, and DPI instead of carrying them over",
    )
    ap.add_argument(
        "--background",
        metavar="#hex",
        help="color behind transparent pixels when flattening to JPEG/BMP (default: white)",
    )
    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    if args.quality is not None and not 1 <= args.quality <= 100:
        sys.stderr.write(f"error: --quality must be between 1 and 100, got {args.quality}\n")
        return 1

    try:
        check_distinct_paths(args.output, args.input)
        background = parse_color(args.background) if args.background else (255, 255, 255, 255)
        im = open_image(args.input)
        animated = bool(getattr(im, "is_animated", False)) and getattr(im, "n_frames", 1) > 1
        fmt = save_with_metadata(
            im,
            args.output,
            quality=args.quality,
            background=background,
            strip_metadata=args.strip_metadata,
        )
    except ImageError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    if animated:
        sys.stderr.write(f"note: {args.input} is animated; only the first frame was converted\n")
    size = human_size(os.path.getsize(args.output))
    print(f"converted {args.input} -> {args.output} ({fmt}, {size})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
