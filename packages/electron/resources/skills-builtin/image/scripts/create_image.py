#!/usr/bin/env python3
"""Authoring template for creating an image from scratch with Pillow.

Copy this into a uniquely named task directory with a random suffix inside the
exact pre-approved session temporary directory shown in the Bash tool
instructions (never the user's folder). Copy that path in full, exactly as
shown; do not reconstruct it or derive it from environment variables. Keep
every working file inside the task directory. Edit ``build_image()`` to build
the requested image, then run it to write the image to the path the user wants:

    kowork-python create_image.py out.png

The directory is scoped to the current task/session. The copy stays there after
a successful write, so you can edit and re-run it when that same task resumes
after an app restart (the OS reclaims temp eventually).

It demonstrates every "create" building block, each editable in one obvious
place: the canvas size (``WIDTH``/``HEIGHT``), a vertical-gradient background
(``vgradient`` -- or a solid ``Image.new`` fill), a rounded-rectangle card with
accent shapes, a title and subtitle drawn with the scalable default font, and
an embedded badge pasted with its alpha channel as the mask. The output format
is inferred from the file extension; JPEG and BMP have no alpha channel, so the
image is flattened onto white for them.

Image note: the badge below is generated in-memory with Pillow so this file is
self-contained. For a real picture, open one with ``Image.open("/absolute/path/photo.png")``,
``resize()`` it to fit, and ``paste()`` it the same way.

Usage:
    kowork-python create_image.py <out.png>
"""

from __future__ import annotations

import argparse
import os
import sys

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 1200, 630  # standard social-card size
FONT = {"head": None, "body": None}  # absolute TrueType paths; None uses the bundled font
SIZE = {"title": 64, "subtitle": 28}  # pixels

TOP_COLOR = (26, 34, 64)
BOTTOM_COLOR = (74, 108, 178)
CARD_FILL = (255, 255, 255, 26)
CARD_OUTLINE = (255, 255, 255, 90)
ACCENT = (240, 180, 70, 255)
TITLE_COLOR = (255, 255, 255, 255)
SUBTITLE_COLOR = (205, 215, 235, 255)

# Same map as the image skill's imgutil.FORMAT_BY_EXT, duplicated inline so the
# copied template stays self-contained.
FORMAT_BY_EXT = {
    ".png": "PNG",
    ".jpg": "JPEG",
    ".jpeg": "JPEG",
    ".webp": "WEBP",
    ".gif": "GIF",
    ".bmp": "BMP",
    ".tif": "TIFF",
    ".tiff": "TIFF",
    ".ico": "ICO",
    ".avif": "AVIF",
}
NO_ALPHA_FORMATS = ("JPEG", "BMP")


def vgradient(
    size: tuple[int, int],
    top_color: tuple[int, int, int],
    bottom_color: tuple[int, int, int],
) -> Image.Image:
    """A vertical gradient, interpolating from ``top_color`` to ``bottom_color`` per row."""
    width, height = size
    column = Image.new("RGB", (1, height))
    px = column.load()
    for y in range(height):
        t = y / max(height - 1, 1)
        px[0, y] = tuple(round(a + (b - a) * t) for a, b in zip(top_color, bottom_color))
    return column.resize((width, height))


def flatten(im: Image.Image, background: tuple[int, int, int] = (255, 255, 255)) -> Image.Image:
    """Composite an image with alpha onto a solid RGB background.

    JPEG and BMP have no alpha channel; saving an image with transparency to
    them would otherwise raise or fill transparent pixels with black.
    """
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        base = Image.new("RGB", rgba.size, background)
        base.paste(rgba, mask=rgba.getchannel("A"))
        return base
    if im.mode != "RGB":
        return im.convert("RGB")
    return im


def demo_badge() -> Image.Image:
    """A small badge built in memory, so the template needs no assets.

    Swap this for ``Image.open("/absolute/path/photo.png").convert("RGBA")`` to paste a real
    image file -- ``resize()`` it to fit first.
    """
    badge = Image.new("RGBA", (160, 160), (0, 0, 0, 0))
    d = ImageDraw.Draw(badge)
    d.ellipse((4, 4, 156, 156), fill=ACCENT, outline=(255, 255, 255, 255), width=6)
    d.ellipse((58, 58, 102, 102), fill=(*TOP_COLOR, 255))
    return badge


def build_image() -> Image.Image:
    """The image content. Edit this to change what the image contains."""
    im = vgradient((WIDTH, HEIGHT), TOP_COLOR, BOTTOM_COLOR).convert("RGBA")

    margin = 72
    # ImageDraw writes pixels without blending them, so translucent shapes are
    # drawn on a clear overlay and then composited down onto the canvas.
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    card = ImageDraw.Draw(overlay)
    card.rounded_rectangle(
        (margin, margin, WIDTH - margin, HEIGHT - margin),
        radius=36,
        fill=CARD_FILL,
        outline=CARD_OUTLINE,
        width=2,
    )
    im = Image.alpha_composite(im, overlay)
    draw = ImageDraw.Draw(im)

    cx = WIDTH // 2
    badge = demo_badge()
    # The badge's own alpha channel is the paste mask, so the circle keeps its
    # soft edges; to paste a real picture instead, use an absolute path.
    im.paste(badge, (cx - badge.width // 2, margin + 64), badge)

    draw.line((cx - 60, 330, cx + 60, 330), fill=ACCENT, width=6)
    draw.ellipse(
        (WIDTH - margin - 92, margin + 34, WIDTH - margin - 34, margin + 92),
        fill=ACCENT,
    )

    # The default font scales with size (Pillow bundles freetype); for a
    # specific look use ImageFont.truetype("/path/to/font.ttf", size) instead.
    title_font = ImageFont.truetype(FONT["head"], SIZE["title"]) if FONT["head"] else ImageFont.load_default(SIZE["title"])
    subtitle_font = ImageFont.truetype(FONT["body"], SIZE["subtitle"]) if FONT["body"] else ImageFont.load_default(SIZE["subtitle"])
    draw.text((cx, 405), "Your Title Here", font=title_font, fill=TITLE_COLOR, anchor="mm")
    draw.text(
        (cx, 465),
        "Edit build_image() to change this card",
        font=subtitle_font,
        fill=SUBTITLE_COLOR,
        anchor="mm",
    )

    return im


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Create an image from an editable Pillow template.")
    ap.add_argument("output", nargs="?", default="output.png", help="path to write the image")
    args = ap.parse_args(argv)

    fmt = FORMAT_BY_EXT.get(os.path.splitext(args.output)[1].lower())
    if fmt is None:
        sys.stderr.write(
            f"error: cannot infer an image format from {args.output!r}; use a known "
            "extension: " + ", ".join(sorted(FORMAT_BY_EXT)) + "\n"
        )
        return 1

    try:
        im = build_image()
        if fmt in NO_ALPHA_FORMATS:
            im = flatten(im)
        im.save(args.output, fmt)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    size = os.path.getsize(args.output)
    print(f"wrote {args.output} {size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
