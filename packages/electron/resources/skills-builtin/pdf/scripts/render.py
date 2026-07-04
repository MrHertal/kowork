#!/usr/bin/env python3
"""Render PDF pages to image files with pypdfium2 (saved via Pillow).

This is the skill's "see the page" path: rasterise pages for visual QA, previews,
or to verify form-fill placement. After rendering, read an image file back to
actually view it.

Resolution has two knobs, mutually exclusive: ``--dpi`` is the friendly one (PDF
units are 1/72 inch, so N DPI maps to a pypdfium2 scale of N/72), and ``--scale``
sets that native factor directly (1.0 = 72 DPI). Very high DPI is wasteful here:
the host downscales large images before a model sees them, so ~150 DPI is a good
default for reading and QA.

Encrypted inputs that need a password cannot be opened; this reports that clearly
and points at ``pages.py decrypt`` rather than crashing (empty-password PDFs open
fine).

Usage:
    kowork-python render.py <in.pdf> <outdir> [--pages 1-3,5] \\
        [--dpi 150 | --scale 2.0] [--format png|jpeg] [--jpeg-quality 85]
"""

from __future__ import annotations

import argparse
import os
import sys

import pypdfium2 as pdfium

from pdfutil import parse_page_ranges

DEFAULT_DPI = 150.0
POINTS_PER_INCH = 72.0
EXT = {"png": "png", "jpeg": "jpg"}


def resolve_scale(args: argparse.Namespace) -> tuple[float, float]:
    """Return ``(scale, dpi)`` from the mutually-exclusive --dpi/--scale knobs."""
    if args.scale is not None:
        if args.scale <= 0:
            raise ValueError("--scale must be positive")
        scale = args.scale
    else:
        dpi = args.dpi if args.dpi is not None else DEFAULT_DPI
        if dpi <= 0:
            raise ValueError("--dpi must be positive")
        scale = dpi / POINTS_PER_INCH
    return scale, scale * POINTS_PER_INCH


def open_document(path: str) -> pdfium.PdfDocument:
    """Open a PDF, turning a password requirement into a clear, actionable error.

    If the file carries a form, initialise its form environment too: pypdfium2
    skips form-field widgets when rendering unless the form env exists, so a
    filled AcroForm would otherwise rasterise with its fields blank.
    """
    try:
        pdf = pdfium.PdfDocument(path)
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower():
            raise RuntimeError(
                f"{path} is encrypted and needs a password; decrypt it first "
                "with 'pages.py decrypt'"
            ) from exc
        raise RuntimeError(f"cannot open {path}: {exc}") from exc
    # 0 is FORMTYPE_NONE; any other type (AcroForm/XFA) needs a form env before
    # its field values will draw. Best-effort: fall back to a content-only
    # render rather than failing the whole command if form init goes wrong.
    if pdf.get_formtype() != 0:
        try:
            pdf.init_forms()
        except Exception:
            pass
    return pdf


def render_pages(
    pdf: pdfium.PdfDocument,
    indices: list[int],
    outdir: str,
    total: int,
    scale: float,
    fmt: str,
    jpeg_quality: int,
) -> None:
    width = max(3, len(str(total)))
    ext = EXT[fmt]
    for idx in indices:
        image = pdf[idx].render(scale=scale).to_pil()
        out_path = os.path.join(outdir, f"page_{idx + 1:0{width}d}.{ext}")
        if fmt == "jpeg":
            # JPEG has no alpha channel, so flatten to RGB before saving.
            image.convert("RGB").save(out_path, "JPEG", quality=jpeg_quality)
        else:
            image.save(out_path, "PNG")


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Render PDF pages to image files (pypdfium2).")
    ap.add_argument("input", help="path to the .pdf file")
    ap.add_argument("outdir", help="directory to write images into (created if needed)")
    ap.add_argument("--pages", help="pages to render, e.g. '1-3,5' (default: all)")
    resolution = ap.add_mutually_exclusive_group()
    resolution.add_argument("--dpi", type=float, help=f"target resolution in DPI (default: {DEFAULT_DPI:g})")
    resolution.add_argument("--scale", type=float, help="pypdfium2 scale factor, 1.0 = 72 DPI")
    ap.add_argument("--format", choices=("png", "jpeg"), default="png", help="image format (default: png)")
    ap.add_argument("--jpeg-quality", type=int, default=85, help="JPEG quality 1-95 (default: 85; JPEG only)")
    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)

    try:
        scale, dpi = resolve_scale(args)
    except ValueError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    if not os.path.isfile(args.input):
        sys.stderr.write(f"error: no such file: {args.input}\n")
        return 1

    try:
        pdf = open_document(args.input)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    try:
        total = len(pdf)
        indices = parse_page_ranges(args.pages, total) if args.pages else list(range(total))
        os.makedirs(args.outdir, exist_ok=True)
        render_pages(pdf, indices, args.outdir, total, scale, args.format, args.jpeg_quality)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1
    finally:
        pdf.close()

    print(f"rendered {len(indices)} page(s) to {args.outdir} at {dpi:g} DPI")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
