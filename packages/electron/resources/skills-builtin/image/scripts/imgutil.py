"""Shared helpers for the image skill.

Utilities the image scripts have in common, kept here so the individual scripts
stay short: opening an image with Pillow (``open_image`` / ``ImageError``), the
``WxH`` size and ``#RRGGBB`` color parsers, output-format inference, flattening
an image with alpha onto a solid background (for formats without an alpha
channel), and the byte-size formatter.
"""

from __future__ import annotations

import os

from PIL import Image, ImageColor, ImageOps


class ImageError(Exception):
    """A user-facing failure; the image scripts print it as ``error: ...`` and exit 1."""


def open_image(path: str) -> Image.Image:
    """Open an image with Pillow, turning the common failures into ``ImageError``.

    The first frame is decoded here (``load()``), so a truncated or corrupt file
    fails at open time with a clear message rather than mid-operation. The image
    is returned as stored on disk -- EXIF orientation is not applied (see
    ``apply_orientation``); for multi-frame images the caller seeks the frames.
    """
    if not os.path.isfile(path):
        raise ImageError(f"no such file: {path}")
    try:
        im = Image.open(path)
    except Exception as exc:
        raise ImageError(f"cannot read {path}: {exc}")
    try:
        im.load()
    except Exception as exc:
        raise ImageError(f"cannot decode {path}: {exc}")
    return im


def apply_orientation(im: Image.Image) -> Image.Image:
    """Bake any EXIF orientation into the pixels (e.g. a phone photo held sideways).

    Scripts that re-encode should apply this before transforming, so the output
    looks the way viewers display the input. ``info.py`` reports the raw stored
    geometry instead.
    """
    return ImageOps.exif_transpose(im)


def parse_size(spec: str) -> tuple[int, int]:
    """Parse a ``WxH`` size like ``"800x600"`` into ``(800, 600)``.

    Raises ``ImageError`` on malformed syntax or a non-positive dimension --
    callers surface that as an error rather than silently clamping, so a typo
    never produces the wrong size.
    """
    parts = spec.lower().split("x")
    if len(parts) != 2 or not all(p.isdigit() for p in parts):
        raise ImageError(f"invalid size {spec!r}; expected WxH, e.g. 800x600")
    width, height = int(parts[0]), int(parts[1])
    if width < 1 or height < 1:
        raise ImageError(f"invalid size {spec!r}; width and height must be positive")
    return width, height


def parse_color(spec: str) -> tuple[int, int, int, int]:
    """Parse a color spec into an ``(R, G, B, A)`` tuple.

    Accepts ``#RGB``, ``#RRGGBB``, ``#RRGGBBAA`` and Pillow's named colors
    (``"red"``, ``"white"``, ...). Raises ``ImageError`` on anything else.
    """
    try:
        rgba = ImageColor.getrgb(spec)
    except ValueError:
        raise ImageError(f"invalid color {spec!r}; expected #RRGGBB or a named color")
    if len(rgba) == 3:
        return (*rgba, 255)
    return rgba


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


def format_for_path(path: str) -> str:
    """Infer the Pillow save format from a file extension."""
    ext = os.path.splitext(path)[1].lower()
    fmt = FORMAT_BY_EXT.get(ext)
    if fmt is None:
        raise ImageError(
            f"cannot infer an image format from {path!r}; use a known "
            "extension: " + ", ".join(sorted(FORMAT_BY_EXT))
        )
    return fmt


def flatten(
    im: Image.Image, background: tuple[int, int, int, int] = (255, 255, 255, 255)
) -> Image.Image:
    """Composite an image with alpha onto a solid RGB background.

    JPEG and BMP have no alpha channel; saving an image with transparency to
    them would otherwise raise or fill transparent pixels with black.
    """
    if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
        rgba = im.convert("RGBA")
        base = Image.new("RGB", rgba.size, background[:3])
        base.paste(rgba, mask=rgba.getchannel("A"))
        return base
    if im.mode != "RGB":
        return im.convert("RGB")
    return im


def save_image(
    im: Image.Image,
    path: str,
    *,
    quality: int | None = None,
    background: tuple[int, int, int, int] = (255, 255, 255, 255),
) -> str:
    """Save ``im`` to ``path``, inferring the format from the extension.

    Images are flattened onto ``background`` for formats with no alpha channel;
    ``quality`` applies to the lossy formats (JPEG, WebP, AVIF) and is ignored
    otherwise. Returns the format written.
    """
    fmt = format_for_path(path)
    if fmt in ("JPEG", "BMP"):
        im = flatten(im, background)
    kwargs: dict = {}
    if quality is not None and fmt in ("JPEG", "WEBP", "AVIF"):
        kwargs["quality"] = quality
    try:
        im.save(path, fmt, **kwargs)
    except Exception as exc:
        raise ImageError(f"cannot write {path}: {exc}")
    return fmt


def human_size(num_bytes: int) -> str:
    """Format a byte count compactly, e.g. ``2.4 MB``."""
    if num_bytes < 1024:
        return f"{num_bytes} bytes"
    value = float(num_bytes)
    for unit in ("KB", "MB", "GB"):
        value /= 1024
        if value < 1024 or unit == "GB":
            return f"{value:.1f} {unit}"
    return f"{value:.1f} GB"
