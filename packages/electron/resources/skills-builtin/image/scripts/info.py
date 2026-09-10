#!/usr/bin/env python3
"""Inspect an image: format, dimensions, color mode, frames, and metadata.

This is the image skill's "what is this file" path: run it before any edit to
learn what you are working with (a photo's EXIF orientation, whether a PNG has
alpha, whether a GIF is animated), or on its own to answer questions about an
image. Human-readable by default; ``--json`` prints one JSON object instead.

GPS EXIF fields are reported as present/absent, not decoded to coordinates, and
large binary blobs (maker notes, embedded thumbnails) are omitted.

Usage:
    kowork-python info.py <image> [--json]
"""

from __future__ import annotations

import argparse
import json
import os
import sys

from PIL import ExifTags, Image

from imgutil import ImageError, human_size, open_image


def clean_exif_value(value) -> str | None:
    """One EXIF value as a short printable string, or None to skip it."""
    if isinstance(value, bytes):
        return None
    text = str(value).strip("\x00").strip()
    if not text or len(text) > 120:
        return None
    return text


def collect_exif(im: Image.Image) -> dict[str, str]:
    """Collect the printable EXIF tags of the first frame.

    Reads both the top-level IFD and the Exif IFD (which holds DateTimeOriginal
    and the camera settings). GPS is reported as present/absent only.
    """
    try:
        exif = im.getexif()
    except Exception:
        return {}
    out: dict[str, str] = {}

    # Structural pointer tags (Exif IFD offset, GPS IFD offset) are noise; the
    # IFDs they point at are read directly below.
    skip_ids = {0x8769, 0x8825}

    def take(pairs) -> None:
        for tag_id, value in pairs:
            if tag_id in skip_ids:
                continue
            name = ExifTags.TAGS.get(tag_id, str(tag_id))
            text = clean_exif_value(value)
            if text is not None:
                out.setdefault(name, text)

    take(exif.items())
    try:
        take(exif.get_ifd(ExifTags.IFD.Exif).items())
    except Exception:
        pass
    try:
        if exif.get_ifd(ExifTags.IFD.GPSInfo):
            out["GPSInfo"] = "present"
    except Exception:
        pass
    return out


def frame_durations(im: Image.Image, n_frames: int) -> list[int]:
    """Every frame's duration in ms (0 when a frame does not state one).

    Seeks through the animation, so a truncated file may yield fewer values --
    that is fine, the range of what was readable is still reported. The image
    is left back on the first frame.
    """
    durations: list[int] = []
    try:
        for index in range(n_frames):
            im.seek(index)
            durations.append(im.info.get("duration", 0))
    except EOFError:
        pass
    try:
        im.seek(0)
    except EOFError:
        pass
    return durations


def describe(path: str) -> dict:
    """Gather everything ``info.py`` reports about the image at ``path``."""
    im = open_image(path)
    n_frames = getattr(im, "n_frames", 1)
    animated = bool(getattr(im, "is_animated", False)) and n_frames > 1
    exif = collect_exif(im)  # frame 0, before duration gathering seeks around
    durations = frame_durations(im, n_frames) if animated else []
    duration_range = None
    if durations and len(set(durations)) > 1:
        duration_range = [min(durations), max(durations)]
    info = {
        "path": path,
        "bytes": os.path.getsize(path),
        "format": im.format,
        "format_description": im.format_description,
        "width": im.width,
        "height": im.height,
        "mode": im.mode,
        "frames": n_frames,
        "animated": animated,
        "has_alpha": "A" in im.getbands() or (im.mode == "P" and "transparency" in im.info),
        "dpi": im.info.get("dpi"),
        "duration_ms": im.info.get("duration") if animated else None,
        "loop": im.info.get("loop") if animated else None,
        "exif": exif,
    }
    if duration_range is not None:
        # Keyed separately so uniform animations keep the single duration_ms.
        info["duration_ms_range"] = duration_range
    return info


def print_human(info: dict) -> None:
    print(info["path"])
    size = human_size(info["bytes"])
    exact = f"{info['bytes']:,} bytes"
    print(f"  file size: {size}" if size == exact else f"  file size: {size} ({exact})")
    print(f"  format: {info['format']} ({info['format_description']})")
    print(f"  size: {info['width']}x{info['height']}")
    alpha = " (alpha)" if info["has_alpha"] else ""
    print(f"  mode: {info['mode']}{alpha}")
    if info["animated"]:
        loop = "forever" if info["loop"] == 0 else f"{info['loop']} time(s)"
        if info.get("duration_ms_range"):
            lo, hi = info["duration_ms_range"]
            timing = f"{lo}-{hi} ms/frame"
        else:
            timing = f"{info['duration_ms']} ms/frame"
        print(f"  frames: {info['frames']} (animated, {timing}, loops {loop})")
    else:
        print(f"  frames: {info['frames']}")
    if info["dpi"]:
        print(f"  dpi: {info['dpi'][0]:g} x {info['dpi'][1]:g}")
    if info["exif"]:
        print("  exif:")
        for name in sorted(info["exif"]):
            print(f"    {name}: {info['exif'][name]}")


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Inspect an image's format, dimensions, and metadata.")
    ap.add_argument("input", help="path to the image file")
    ap.add_argument("--json", action="store_true", help="print one JSON object instead of text")
    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    try:
        info = describe(args.input)
    except ImageError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    if args.json:
        print(json.dumps(info, indent=2, default=str))
    else:
        print_human(info)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
