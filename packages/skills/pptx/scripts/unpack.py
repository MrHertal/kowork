#!/usr/bin/env python3
"""Unpack a .pptx (an OPC ZIP container) into a directory of XML parts.

Editing a presentation by hand means working on the parts inside the ZIP, chiefly
the per-slide ``ppt/slides/slideN.xml`` files. Run this, edit the parts, then
repack with ``pack.py`` (work in a temp dir, never the user's folder).

By default the XML parts are pretty-printed, so hand-editing is line-based rather
than one giant line. Unlike the docx skill, adjacent runs are deliberately NOT
merged: there is no turnkey text-replace in this skill, slide text is edited
directly in the pretty XML, so the parts are reproduced as faithfully as the
serializer allows. Pass --no-pretty for verbatim parts.

Text content is never transformed (no quote "smartening" or the like): lxml's
serializer already escapes the markup-significant characters (& < >), and
typographic quotes round-trip unchanged as UTF-8. Guidance on authoring quotes
and entities when editing lives in the skill's references, not as a transform
here.

Usage:
    kowork-python unpack.py <input.pptx> <output_dir> [--no-pretty]
"""

from __future__ import annotations

import argparse
import os
import sys

from pptxutil import parse_xml, read_parts, serialize, serialize_pretty


def render_part(name: str, data: bytes, pretty: bool) -> bytes:
    """Return the bytes to write for one part, pretty-printing XML when asked.

    Non-XML parts (media, etc.) and anything that fails to parse are written
    verbatim, so unpack never corrupts or drops a part it doesn't understand.
    """
    if not pretty:
        return data
    if not (name.endswith(".xml") or name.endswith(".rels")):
        return data
    try:
        root = parse_xml(data)
    except Exception:
        return data
    return serialize_pretty(root)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Unpack a .pptx into a directory of OOXML parts.")
    ap.add_argument("input", help="path to the .pptx file")
    ap.add_argument("output_dir", help="directory to unpack into (use a temp dir)")
    ap.add_argument("--no-pretty", action="store_true", help="write parts verbatim, not indented")
    args = ap.parse_args(argv)

    try:
        parts = read_parts(args.input)
    except Exception as exc:  # surface the reason; do not extract anything unsafe
        sys.stderr.write(f"error: {exc}\n")
        return 1

    out_dir = args.output_dir
    for name, data in parts.items():
        body = render_part(name, data, not args.no_pretty)
        # read_parts already rejected traversal, but re-check after join as defence in depth.
        target = os.path.normpath(os.path.join(out_dir, name))
        if os.path.commonpath([os.path.abspath(target), os.path.abspath(out_dir)]) != os.path.abspath(out_dir):
            sys.stderr.write(f"error: refusing to write outside output dir: {name}\n")
            return 1
        parent = os.path.dirname(target)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(target, "wb") as fh:
            fh.write(body)

    print(f"unpacked {len(parts)} parts into {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
