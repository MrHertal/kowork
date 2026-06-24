#!/usr/bin/env python3
"""Read a .docx into clean Markdown using mammoth.

mammoth maps Word's *semantic* styles (headings, lists, bold/italic, tables,
links) to Markdown and deliberately drops presentation noise, which makes it
good for summarising. Two caveats worth stating to the caller:

  * Tracked changes are shown in their *accepted* form: inserted text appears,
    deleted text does not. To see redlines (``w:ins`` / ``w:del``) you must read
    the raw XML -- unpack.py, then look at word/document.xml.
  * Images are emitted as data-URI references by default; pass --no-images to
    drop them, which keeps summaries readable.

Usage:
    kowork-python read_docx.py <input.docx> [-o out.md] [--messages] [--no-images] [--raw-text]
"""

from __future__ import annotations

import argparse
import sys

import mammoth


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Convert a .docx to Markdown with mammoth.")
    ap.add_argument("input", help="path to the .docx file")
    ap.add_argument("-o", "--out", help="write Markdown here instead of stdout")
    ap.add_argument("--messages", action="store_true", help="print mammoth warnings to stderr")
    ap.add_argument("--no-images", action="store_true", help="omit images instead of inlining them")
    ap.add_argument("--raw-text", action="store_true", help="extract plain text instead of Markdown")
    args = ap.parse_args(argv)

    convert_kwargs = {}
    if args.no_images:
        # Replace the default image handler with one that emits nothing.
        convert_kwargs["convert_image"] = mammoth.images.img_element(lambda _image: {})

    try:
        with open(args.input, "rb") as fh:
            if args.raw_text:
                result = mammoth.extract_raw_text(fh)
            else:
                result = mammoth.convert_to_markdown(fh, **convert_kwargs)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    text = result.value
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text)
        print(f"wrote {len(text)} chars to {args.out}")
    else:
        sys.stdout.write(text)
        if not text.endswith("\n"):
            sys.stdout.write("\n")

    if args.messages and result.messages:
        for msg in result.messages:
            sys.stderr.write(f"[{msg.type}] {msg.message}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
