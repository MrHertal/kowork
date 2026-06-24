#!/usr/bin/env python3
"""Structural page operations on PDFs with pypdf.

A single tool with one subcommand per operation. Read metadata, concatenate
files, burst into single pages, copy or drop a page selection, reorder, rotate,
or set the crop box; stamp a watermark; and encrypt or decrypt with a password.
Page selections (``--pages``) use the shared ``1-3,5`` syntax; ``reorder`` takes
an explicit ordered ``--order`` instead.

A watermark's transparency is whatever the stamp PDF itself provides -- author a
see-through stamp with create_pdf.py if you want existing content to show
through. Encrypted inputs that need a password cannot be read by the other
subcommands; ``decrypt`` writes an unencrypted copy to work from.

Usage:
    kowork-python pages.py metadata <in.pdf>
    kowork-python pages.py merge <a.pdf> <b.pdf> [<c.pdf> ...] -o <out.pdf>
    kowork-python pages.py split <in.pdf> <outdir> [--pages 1-3,5]
    kowork-python pages.py extract <in.pdf> -o <out.pdf> --pages 1-3,5
    kowork-python pages.py delete <in.pdf> -o <out.pdf> --pages 2,4
    kowork-python pages.py reorder <in.pdf> -o <out.pdf> --order 3,1,2
    kowork-python pages.py rotate <in.pdf> -o <out.pdf> --degrees 90 [--pages 1-3]
    kowork-python pages.py crop <in.pdf> -o <out.pdf> --box 36,36,576,756 [--pages 1]
    kowork-python pages.py watermark <in.pdf> -o <out.pdf> --stamp <stamp.pdf> [--pages 1-3] [--under]
    kowork-python pages.py encrypt <in.pdf> -o <out.pdf> --password USER [--owner OWNER]
    kowork-python pages.py decrypt <in.pdf> -o <out.pdf> --password PW
"""

from __future__ import annotations

import argparse
import os
import sys

from pypdf import PdfReader, PdfWriter
from pypdf.generic import NameObject, NumberObject

from pdfutil import open_reader, parse_page_ranges, parse_page_sequence, refuse_inplace


class PagesError(Exception):
    """A user-facing failure; main prints it as ``error: ...`` and exits 1."""


def write_pdf(writer: PdfWriter, out_path: str) -> None:
    with open(out_path, "wb") as fh:
        writer.write(fh)


def select_indices(pages_spec: str | None, total: int) -> list[int]:
    """0-based indices for an optional ``--pages`` selection (all if omitted)."""
    if pages_spec:
        return parse_page_ranges(pages_spec, total)
    return list(range(total))


def parse_box(spec: str) -> tuple[float, float, float, float]:
    """Parse ``L,B,R,T`` (PDF points, origin bottom-left) into four floats."""
    parts = spec.split(",")
    if len(parts) != 4:
        raise PagesError(f"--box must be L,B,R,T (four numbers), got {spec!r}")
    try:
        left, bottom, right, top = (float(p.strip()) for p in parts)
    except ValueError:
        raise PagesError(f"--box values must be numbers, got {spec!r}")
    if left >= right or bottom >= top:
        raise PagesError(f"--box needs L<R and B<T, got {spec!r}")
    return left, bottom, right, top


def cmd_metadata(args: argparse.Namespace) -> int:
    reader = open_reader(args.input)
    print(f"pages: {len(reader.pages)}")
    meta = reader.metadata
    if not meta:
        return 0
    fields = [
        ("title", meta.title),
        ("author", meta.author),
        ("subject", meta.subject),
        ("creator", meta.creator),
        ("producer", meta.producer),
        ("creation_date", _meta_date(meta, "creation_date")),
        ("modification_date", _meta_date(meta, "modification_date")),
    ]
    for key, value in fields:
        if value:
            print(f"{key}: {value}")
    return 0


def _meta_date(meta, attr: str) -> str | None:
    """A document date as ISO 8601, falling back to its raw PDF date string."""
    try:
        value = getattr(meta, attr)
    except Exception:
        value = None
    if value is not None:
        return value.isoformat()
    raw = getattr(meta, attr + "_raw", None)
    return str(raw) if raw else None


def cmd_merge(args: argparse.Namespace) -> int:
    if len(args.inputs) < 2:
        raise PagesError("merge needs at least two input PDFs")
    for path in args.inputs:
        refuse_inplace(args.out, path)
    writer = PdfWriter()
    for path in args.inputs:
        writer.append(open_reader(path))
    write_pdf(writer, args.out)
    print(f"merged {len(args.inputs)} files ({len(writer.pages)} pages) into {args.out}")
    return 0


def cmd_split(args: argparse.Namespace) -> int:
    reader = open_reader(args.input)
    total = len(reader.pages)
    indices = select_indices(args.pages, total)
    os.makedirs(args.outdir, exist_ok=True)
    width = max(3, len(str(total)))
    for idx in indices:
        writer = PdfWriter()
        writer.add_page(reader.pages[idx])
        # Filename carries the original 1-based page number, so a partial burst
        # keeps each page's identity (e.g. --pages 5 -> page_005.pdf).
        write_pdf(writer, os.path.join(args.outdir, f"page_{idx + 1:0{width}d}.pdf"))
    print(f"wrote {len(indices)} page file(s) to {args.outdir}")
    return 0


def cmd_extract(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    reader = open_reader(args.input)
    indices = parse_page_ranges(args.pages, len(reader.pages))
    writer = PdfWriter()
    for idx in indices:
        writer.add_page(reader.pages[idx])
    write_pdf(writer, args.out)
    print(f"extracted {len(indices)} page(s) into {args.out}")
    return 0


def cmd_delete(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    reader = open_reader(args.input)
    total = len(reader.pages)
    drop = set(parse_page_ranges(args.pages, total))
    keep = [i for i in range(total) if i not in drop]
    if not keep:
        raise PagesError("delete would remove every page")
    writer = PdfWriter()
    for idx in keep:
        writer.add_page(reader.pages[idx])
    write_pdf(writer, args.out)
    print(f"kept {len(keep)} of {total} page(s) (dropped {len(drop)}) -> {args.out}")
    return 0


def cmd_reorder(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    reader = open_reader(args.input)
    # --order is an explicit sequence: it may repeat or omit pages, so the
    # output can be longer or shorter than the input.
    order = parse_page_sequence(args.order, len(reader.pages))
    writer = PdfWriter()
    for idx in order:
        writer.add_page(reader.pages[idx])
    write_pdf(writer, args.out)
    print(f"wrote {len(order)} page(s) in the given order -> {args.out}")
    return 0


def cmd_rotate(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    if args.degrees % 90 != 0:
        raise PagesError(f"--degrees must be a multiple of 90, got {args.degrees}")
    reader = open_reader(args.input)
    total = len(reader.pages)
    targets = select_indices(args.pages, total)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    # pypdf adds to any existing /Rotate without normalising, so fold the new
    # angle in and keep the result in 0-359 (avoids 360 or negative rotations).
    for idx in targets:
        page = writer.pages[idx]
        page[NameObject("/Rotate")] = NumberObject((page.rotation + args.degrees) % 360)
    write_pdf(writer, args.out)
    print(f"rotated {len(targets)} page(s) by {args.degrees} degrees -> {args.out}")
    return 0


def cmd_crop(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    left, bottom, right, top = parse_box(args.box)
    reader = open_reader(args.input)
    total = len(reader.pages)
    targets = select_indices(args.pages, total)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    for idx in targets:
        page = writer.pages[idx]
        page.cropbox.lower_left = (left, bottom)
        page.cropbox.upper_right = (right, top)
    write_pdf(writer, args.out)
    print(f"cropped {len(targets)} page(s) to [{left},{bottom},{right},{top}] -> {args.out}")
    return 0


def cmd_watermark(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    refuse_inplace(args.out, args.stamp)
    reader = open_reader(args.input)
    stamp_page = open_reader(args.stamp).pages[0]
    targets = select_indices(args.pages, len(reader.pages))
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    # over=True draws the stamp on top of existing content; --under puts it
    # behind. Stamps of a different size overlay from the origin (bottom-left).
    for idx in targets:
        writer.pages[idx].merge_page(stamp_page, over=not args.under)
    write_pdf(writer, args.out)
    placement = "behind" if args.under else "over"
    print(f"stamped {len(targets)} page(s) {placement} content -> {args.out}")
    return 0


def cmd_encrypt(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    reader = open_reader(args.input)
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    owner = args.owner if args.owner is not None else args.password
    writer.encrypt(user_password=args.password, owner_password=owner, algorithm="AES-256")
    write_pdf(writer, args.out)
    which = "user and owner passwords" if args.owner is not None else "user password (owner defaults to it)"
    print(f"encrypted with AES-256, set {which} -> {args.out}")
    return 0


def cmd_decrypt(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    # decrypt needs the password, so it reads directly rather than through
    # open_reader (which refuses password-protected files by design).
    path = args.input
    if not os.path.isfile(path):
        raise PagesError(f"no such file: {path}")
    try:
        reader = PdfReader(path)
    except Exception as exc:
        raise PagesError(f"cannot read {path}: {exc}")
    if not reader.is_encrypted:
        raise PagesError(f"{path} is not encrypted; nothing to decrypt")
    try:
        opened = reader.decrypt(args.password)
    except Exception as exc:
        raise PagesError(f"cannot decrypt {path}: {exc}")
    if not opened:
        raise PagesError(f"wrong password for {path}")
    try:
        count = len(reader.pages)
    except Exception as exc:
        raise PagesError(f"cannot read pages of {path}: {exc}")
    if count < 1:
        raise PagesError(f"{path} has no pages")
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    write_pdf(writer, args.out)
    print(f"decrypted {count} page(s) -> {args.out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Structural page operations on PDFs (pypdf).")
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("metadata", help="print page count and document info")
    p.add_argument("input", help="path to the .pdf file")
    p.set_defaults(func=cmd_metadata)

    p = sub.add_parser("merge", help="concatenate two or more PDFs in order")
    p.add_argument("inputs", nargs="+", help="input PDFs, in the order to join them")
    p.add_argument("-o", "--out", required=True, help="path to write the merged PDF")
    p.set_defaults(func=cmd_merge)

    p = sub.add_parser("split", help="burst into one file per page")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("outdir", help="directory to write page files into (created if needed)")
    p.add_argument("--pages", help="limit which pages to burst, e.g. '1-3,5' (default: all)")
    p.set_defaults(func=cmd_split)

    p = sub.add_parser("extract", help="copy selected pages into one new PDF")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", required=True, help="path to write the extracted PDF")
    p.add_argument("--pages", required=True, help="pages to copy, e.g. '1-3,5' (in selection order)")
    p.set_defaults(func=cmd_extract)

    p = sub.add_parser("delete", help="drop selected pages, keep the rest in order")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--pages", required=True, help="pages to drop, e.g. '2,4'")
    p.set_defaults(func=cmd_delete)

    p = sub.add_parser("reorder", help="write pages in an explicit order")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--order", required=True, help="ordered page list, e.g. '3,1,2' (may repeat or omit)")
    p.set_defaults(func=cmd_reorder)

    p = sub.add_parser("rotate", help="rotate selected pages by a multiple of 90")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--degrees", required=True, type=int, help="clockwise rotation, a multiple of 90")
    p.add_argument("--pages", help="pages to rotate, e.g. '1-3' (default: all)")
    p.set_defaults(func=cmd_rotate)

    p = sub.add_parser("crop", help="set the crop box on selected pages")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--box", required=True, help="crop box L,B,R,T in PDF points (origin bottom-left)")
    p.add_argument("--pages", help="pages to crop, e.g. '1' (default: all)")
    p.set_defaults(func=cmd_crop)

    p = sub.add_parser(
        "watermark",
        help="overlay a stamp PDF's first page onto pages",
        description="Overlay the first page of --stamp onto each selected page. "
        "Transparency is whatever the stamp PDF itself provides; author a "
        "see-through stamp with create_pdf.py if you want content to show through.",
    )
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--stamp", required=True, help="PDF whose first page is the stamp/watermark")
    p.add_argument("--pages", help="pages to stamp, e.g. '1-3' (default: all)")
    p.add_argument("--under", action="store_true", help="place the stamp behind content (default: on top)")
    p.set_defaults(func=cmd_watermark)

    p = sub.add_parser("encrypt", help="write a password-protected (AES-256) copy")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", required=True, help="path to write the encrypted PDF")
    p.add_argument("--password", required=True, help="user password (required to open the PDF)")
    p.add_argument("--owner", help="owner password for permissions; defaults to the user password")
    p.set_defaults(func=cmd_encrypt)

    p = sub.add_parser("decrypt", help="write an unencrypted copy using the password")
    p.add_argument("input", help="path to the encrypted .pdf file")
    p.add_argument("-o", "--out", required=True, help="path to write the unencrypted PDF")
    p.add_argument("--password", required=True, help="password that opens the input")
    p.set_defaults(func=cmd_decrypt)

    return ap


def main(argv: list[str]) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
