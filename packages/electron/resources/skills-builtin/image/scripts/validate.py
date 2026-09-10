#!/usr/bin/env python3
"""Validate an image by re-opening it and decoding every frame.

"Valid" here means the file re-opens with Pillow and each frame decodes -- which
is what catches the real failure modes (truncated downloads, corrupt pixel data,
a format the runtime cannot read) that make an image unusable. Run this after
creating or editing an image, before handing it back. It is a soundness smoke
test, not a content or pixel checker.

Usage:
    kowork-python validate.py <image>
"""

from __future__ import annotations

import argparse
import sys

from imgutil import ImageError, open_image


def decode_frames(im) -> int:
    """Seek to and decode every frame; return the frame count.

    ``load()`` forces the codec to decode the current frame's pixel data, so a
    file that merely *identifies* as an image but has corrupt data fails here.
    """
    n_frames = getattr(im, "n_frames", 1)
    for index in range(n_frames):
        try:
            im.seek(index)
            im.load()
        except Exception as exc:
            raise ImageError(f"frame {index + 1} of {n_frames} failed to decode: {exc}")
    return n_frames


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Validate that an image re-opens and fully decodes.")
    ap.add_argument("input", help="path to the image file")
    args = ap.parse_args(argv)

    try:
        im = open_image(args.input)
        # Capture the stored geometry before decoding: seeking an animated image
        # can change its reported mode (GIF frames composite to RGB).
        desc = f"{im.format} {im.width}x{im.height} {im.mode}"
        frames = decode_frames(im)
    except ImageError as exc:
        sys.stderr.write(f"error: {exc}\n")
        sys.stderr.write("FAILED: decode check\n")
        return 1

    print(f"OK: {desc}, {frames} frame(s) decode")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
