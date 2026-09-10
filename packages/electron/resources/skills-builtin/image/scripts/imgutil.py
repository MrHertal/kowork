"""Shared helpers for the image skill.

Utilities the image scripts have in common, kept here so the individual scripts
stay short: opening an image with Pillow (``open_image`` / ``ImageError``), the
input/output overwrite guard (``check_distinct_paths``), the ``WxH`` size and
``#RRGGBB`` color parsers, output-format inference, mode normalization for
unusual-but-legal modes (``normalize_for_edit`` / ``prepare_for_format``),
flattening an image with alpha onto a solid background, the output pixel-count
cap, and the byte-size formatter.
"""

from __future__ import annotations

import os
import sys
import warnings

from PIL import Image, ImageColor, ImageOps


class ImageError(Exception):
    """A user-facing failure; the image scripts print it as ``error: ...`` and exit 1."""


def open_image(path: str) -> Image.Image:
    """Open an image with Pillow, turning the common failures into ``ImageError``.

    The first frame is decoded here (``load()``), so a truncated or corrupt file
    fails at open time with a clear message rather than mid-operation. The image
    is returned as stored on disk -- EXIF orientation is not applied (see
    ``apply_orientation``); for multi-frame images the caller seeks the frames.

    Pillow's decompression-bomb warning (more than ``Image.MAX_IMAGE_PIXELS``
    pixels) is re-emitted as a clean ``note:`` rather than a raw Python warning;
    past twice the limit Pillow raises, which surfaces as a clean ``error:``.
    """
    if not os.path.isfile(path):
        raise ImageError(f"no such file: {path}")
    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        try:
            im = Image.open(path)
        except Exception as exc:
            raise ImageError(f"cannot read {path}: {exc}") from exc
        try:
            im.load()
        except Exception as exc:
            raise ImageError(f"cannot decode {path}: {exc}") from exc
    noted = False
    for w in caught:
        if issubclass(w.category, Image.DecompressionBombWarning):
            if not noted:
                noted = True
                sys.stderr.write(
                    f"note: very large image ({im.width * im.height} pixels); processing anyway\n"
                )
        else:
            warnings.warn(w.message, w.category)
    return im


def check_distinct_paths(out_path: str, *in_paths: str) -> None:
    """Refuse to write the output over any file being read from.

    Re-encoding rewrites the file, so writing the output over an input risks
    corrupting the source mid-operation. Callers pass every input they read.
    ``os.path.samefile`` is used only when both paths exist -- a missing input
    must fall through so ``open_image`` produces its own clean
    ``no such file`` error. Raises ``ImageError`` on a collision, which the
    scripts surface as ``error: ...``.
    """
    for in_path in in_paths:
        same = os.path.realpath(out_path) == os.path.realpath(in_path)
        if not same:
            try:
                same = (
                    os.path.isfile(out_path)
                    and os.path.isfile(in_path)
                    and os.path.samefile(out_path, in_path)
                )
            except OSError:
                same = False
        if same:
            raise ImageError(
                f"input and output are the same file: {in_path}; choose a different output path"
            )


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


def normalize_for_edit(im: Image.Image) -> tuple[Image.Image, str | None]:
    """Bring unusual-but-legal modes into ones the edit math and encoders handle.

    - 16-bit grayscale (``I;16``, ``I;16B``, ``I;16L``) is scaled to 8-bit
      ``L``: samples are divided by 257 (scaled, never clipped), so 50% gray
      stays mid-gray instead of saturating to white.
    - ``I`` (int32) and ``F`` (float) grayscale use the same 1/257 scale,
      i.e. samples are read as the 0-65535 range; anything outside saturates
      when converting to ``L`` (negatives to 0, larger values to 255).
    - ``CMYK`` converts to ``RGB``.

    Everything else is returned unchanged. Returns ``(image, note)``; ``note``
    is ``None`` when no conversion happened, else a short description callers
    print as ``note: ...``.
    """
    if im.mode in ("I;16", "I;16B", "I;16L"):
        return im.point(lambda p: p / 257).convert("L"), f"converted {im.mode} (16-bit) to 8-bit grayscale"
    if im.mode in ("I", "F"):
        return (
            im.point(lambda p: p / 257).convert("L"),
            f"converted {im.mode} to 8-bit grayscale (samples read as the 0-65535 range)",
        )
    if im.mode == "CMYK":
        return im.convert("RGB"), "converted CMYK to RGB"
    return im, None


def check_output_pixels(width: int, height: int) -> None:
    """Refuse an output whose pixel count exceeds Pillow's decompression-bomb limit.

    Output canvas sizes are user-controlled (a grid layout, an explicit
    ``--size``), and an enormous one gets the process OOM-killed or crashes the
    encoder. Pillow's ``Image.MAX_IMAGE_PIXELS`` -- read live, so a caller's
    override is honored -- is the agreed "too big" line; an output at exactly
    the limit still goes through.
    """
    limit = Image.MAX_IMAGE_PIXELS
    if limit is not None and width * height > limit:
        raise ImageError(f"output would be {width * height} pixels; the limit is {limit}")


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


def _has_partial_alpha(im: Image.Image) -> bool:
    """True when the image has an alpha channel with at least one semi-transparent pixel."""
    if im.mode in ("RGBA", "LA"):
        hist = im.getchannel("A").histogram()
    elif im.mode == "P" and "transparency" in im.info:
        hist = im.convert("RGBA").getchannel("A").histogram()
    else:
        return False
    return any(hist[i] for i in range(1, 255))


def prepare_for_format(
    im: Image.Image, fmt: str, background: tuple[int, int, int, int] = (255, 255, 255, 255)
) -> tuple[Image.Image, list[str]]:
    """Get ``im`` ready to save as ``fmt``; return ``(image, notes)``.

    The 8-bit encoders either reject the deep modes (``I;16*``, ``I``, ``F``)
    and CMYK or silently clip them, so those go through ``normalize_for_edit``
    first (PNG keeps ``I;16``/``I;16B`` as true 16-bit; TIFF keeps all of them
    plus CMYK). GIF keeps only on/off transparency, so partial alpha is
    flattened onto ``background``. JPEG and BMP have no alpha channel at all and
    are flattened onto ``background`` (see ``flatten``). ICO cannot exceed 256
    px: Pillow downscales larger images, and a note says so. Callers print each
    note as ``note: ...`` on stderr.
    """
    notes: list[str] = []
    keeps = (
        (im.mode in ("I;16", "I;16B") and fmt in ("PNG", "TIFF"))
        or (im.mode in ("I;16L", "I", "F", "CMYK") and fmt == "TIFF")
    )
    if not keeps:
        im, note = normalize_for_edit(im)
        if note is not None:
            notes.append(f"{note} for {fmt} output")
    if fmt == "GIF" and _has_partial_alpha(im):
        im = flatten(im, background)
        notes.append("GIF transparency is on/off; partially transparent pixels were flattened")
    if fmt in ("JPEG", "BMP"):
        im = flatten(im, background)
    if fmt == "ICO" and max(im.size) > 256:
        notes.append("ICO output is limited to 256px; the saved icon is smaller than the image")
    return im, notes


def save_image(
    im: Image.Image,
    path: str,
    *,
    quality: int | None = None,
    background: tuple[int, int, int, int] = (255, 255, 255, 255),
) -> str:
    """Save ``im`` to ``path``, inferring the format from the extension.

    The image is prepared for the format with ``prepare_for_format`` (mode
    normalization, alpha flattening, ICO size note -- each announced with a
    ``note:`` on stderr); ``quality`` applies to the lossy formats (JPEG, WebP,
    AVIF) and is ignored otherwise. Returns the format written.
    """
    fmt = format_for_path(path)
    im, notes = prepare_for_format(im, fmt, background)
    for note in notes:
        sys.stderr.write(f"note: {note}\n")
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
