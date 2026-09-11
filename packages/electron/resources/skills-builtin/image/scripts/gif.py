#!/usr/bin/env python3
"""Create an animated GIF from still frames, or extract a GIF's frames to PNGs.

``create`` takes 2+ frames in the order given. If their sizes differ, every
frame is resized (LANCZOS) to the FIRST frame's size, with a note on stderr --
a GIF has a single canvas size, so mismatched frames cannot play as-is. GIF
transparency is 1-bit and produces ragged edges, so frames are flattened onto
white (``imgutil.flatten``) rather than carrying alpha into the animation.

``extract`` writes every frame as ``frame_001.png``-style names (zero-padded to
the frame count). Pillow composites GIF frames when seeking, so each PNG is a
full picture even when the file stores only per-frame diffs. A single-frame
input is refused: it is not an animation.

Usage:
    kowork-python gif.py create <frames...> -o <out.gif> [--duration MS] [--loop N]
    kowork-python gif.py extract <in.gif> <outdir/>
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
    flatten,
    format_for_path,
    normalize_for_edit,
    open_image,
)


def create(args: argparse.Namespace) -> tuple[bool, int, int]:
    """Create the GIF; return ``(resized, width, height)``."""
    if len(args.frames) < 2:
        raise ImageError(f"need at least 2 frames, got {len(args.frames)}")
    if args.duration < 1:
        raise ImageError(f"--duration must be a positive number of milliseconds, got {args.duration}")
    if args.loop < 0:
        raise ImageError(f"--loop must be >= 0 (0 = loop forever), got {args.loop}")
    if format_for_path(args.output) != "GIF":
        raise ImageError(f"output must be a .gif file: {args.output}")

    check_distinct_paths(args.output, *args.frames)
    frames = []
    for path in args.frames:
        im, note = normalize_for_edit(apply_orientation(open_image(path)))
        if note:
            sys.stderr.write(f"note: {note}\n")
        frames.append(flatten(im))

    size = frames[0].size
    resized = any(im.size != size for im in frames)
    if resized:
        frames = [im.resize(size, Image.Resampling.LANCZOS) if im.size != size else im for im in frames]

    try:
        frames[0].save(
            args.output,
            "GIF",
            save_all=True,
            append_images=frames[1:],
            duration=args.duration,
            loop=args.loop,
        )
    except Exception as exc:
        raise ImageError(f"cannot write {args.output}: {exc}") from exc
    return resized, size[0], size[1]


def extract(args: argparse.Namespace) -> int:
    """Extract every frame to a PNG; return the frame count."""
    im = open_image(args.input)
    total = getattr(im, "n_frames", 1) if getattr(im, "is_animated", False) else 1
    if total < 2:
        raise ImageError(f"{args.input} is not animated")
    try:
        os.makedirs(args.outdir, exist_ok=True)
    except OSError as exc:
        raise ImageError(f"cannot create {args.outdir}: {exc}") from exc
    width = max(3, len(str(total)))
    outputs = [
        os.path.join(args.outdir, f"frame_{index + 1:0{width}d}.png")
        for index in range(total)
    ]
    # Preflight every frame before any write: a later alias can also be the input.
    for out_path in outputs:
        check_distinct_paths(out_path, args.input)
    for index, out_path in enumerate(outputs):
        im.seek(index)
        frame = im.convert("RGBA")
        try:
            frame.save(out_path, "PNG")
        except Exception as exc:
            raise ImageError(f"cannot write {out_path}: {exc}") from exc
    return total


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Create an animated GIF from frames, or extract a GIF's frames.")
    sub = ap.add_subparsers(dest="command", required=True, metavar="command")

    cp = sub.add_parser("create", help="create an animated GIF from 2+ still images")
    cp.add_argument("paths", nargs="+", metavar="frame", help="input images, in play order")
    cp.add_argument("-o", "--out", dest="output", help="path of the .gif to write")
    cp.add_argument(
        "--duration",
        type=int,
        default=100,
        metavar="MS",
        help="how long each frame shows, in milliseconds (default: 100)",
    )
    cp.add_argument(
        "--loop",
        type=int,
        default=0,
        metavar="N",
        help="how many times to loop; 0 = forever (default: 0)",
    )

    xp = sub.add_parser("extract", help="extract every frame of an animated GIF as a PNG")
    xp.add_argument("input", help="path to the animated .gif")
    xp.add_argument("outdir", help="directory to write frames into (created if needed)")

    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "create":
        if args.output:
            args.frames = args.paths
        else:
            if len(args.paths) < 3:
                sys.stderr.write("error: an output path and at least 2 frames are required\n")
                return 1
            if os.path.exists(args.paths[0]):
                sys.stderr.write(
                    "error: the first positional path already exists; pass -o <out.gif> "
                    "to distinguish the output from the frames\n"
                )
                return 1
            args.output, *args.frames = args.paths

    try:
        if args.command == "create":
            resized, width, height = create(args)
            if resized:
                sys.stderr.write(
                    f"note: frames had different sizes; resized all to {width}x{height} "
                    "(the first frame's size)\n"
                )
            loop_desc = "loop forever" if args.loop == 0 else f"loop {args.loop} time(s)"
            print(
                f"created {args.output} from {len(args.frames)} frame(s) "
                f"({width}x{height}, {args.duration} ms/frame, {loop_desc})"
            )
        else:
            total = extract(args)
            print(f"extracted {total} frame(s) to {args.outdir}")
    except ImageError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
