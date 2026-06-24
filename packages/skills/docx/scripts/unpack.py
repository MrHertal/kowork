#!/usr/bin/env python3
"""Unpack a .docx (an OPC ZIP container) into a directory of XML parts.

Editing a Word document by hand means working on the parts inside the ZIP, the
most important being ``word/document.xml``. Run this, edit the files, then
repack with ``pack.py`` (work in a temp dir, never the user's folder).

By default the XML parts are pretty-printed (so hand-editing is line-based, not
one giant line) and adjacent runs in ``word/document.xml`` that share the same
``w:rPr`` are merged. Word routinely splits one phrase across several ``w:r``
runs (at formatting boundaries, or mid-word after a spell-check); merging them
lands the phrase in a single ``w:t`` so the turnkey edit_text.py / comment.py
can match it. Merging never changes formatting or rendered text. Pass
--no-merge-runs / --no-pretty for verbatim parts.

Usage:
    kowork-python unpack.py <input.docx> <output_dir> [--no-merge-runs] [--no-pretty]
"""

from __future__ import annotations

import argparse
import os
import sys

from lxml import etree

from oxml import parse_xml, qn, read_parts, serialize, serialize_pretty

XML_SPACE = qn("xml:space")


def _rpr_key(run) -> bytes:
    """Canonical form of a run's w:rPr (b'' when it has none) for equality."""
    rpr = run.find(qn("w:rPr"))
    if rpr is None:
        return b""
    try:
        return etree.tostring(rpr, method="c14n")
    except Exception:
        return etree.tostring(rpr)


def _plain_text_leaf(run):
    """The single w:t of a mergeable run, else None.

    A run is mergeable only if its sole content is one w:t (plus an optional
    w:rPr). Runs carrying breaks, tabs, drawings, fields, footnote/comment
    references, etc. are left untouched.
    """
    if run.tag != qn("w:r"):
        return None
    leaf = None
    for child in run:
        if child.tag == qn("w:rPr"):
            continue
        if child.tag == qn("w:t") and leaf is None:
            leaf = child
        else:
            return None
    return leaf


def merge_text_runs(doc_root) -> int:
    """Merge adjacent plain-text runs that share w:rPr. Returns the count merged."""
    merged = 0
    for parent in list(doc_root.iter()):
        prev_leaf = None
        prev_key = None
        for child in list(parent):
            if child.tag == qn("w:r"):
                leaf = _plain_text_leaf(child)
                if leaf is not None:
                    key = _rpr_key(child)
                    if prev_leaf is not None and key == prev_key:
                        prev_leaf.text = (prev_leaf.text or "") + (leaf.text or "")
                        if prev_leaf.text and prev_leaf.text != prev_leaf.text.strip():
                            prev_leaf.set(XML_SPACE, "preserve")
                        parent.remove(child)
                        merged += 1
                        continue
                    prev_leaf, prev_key = leaf, key
                    continue
            prev_leaf = prev_key = None
    return merged


def render_part(name: str, data: bytes, merge_runs: bool, pretty: bool) -> bytes:
    """Return the bytes to write for one part, processing XML when asked.

    Non-XML parts (media, etc.) and anything that fails to parse are written
    verbatim, so unpack never corrupts or drops a part it doesn't understand.
    """
    if not (merge_runs or pretty):
        return data
    if not (name.endswith(".xml") or name.endswith(".rels")):
        return data
    try:
        root = parse_xml(data)
    except Exception:
        return data
    if merge_runs and name == "word/document.xml":
        try:
            merge_text_runs(root)
        except Exception:
            pass
    return serialize_pretty(root) if pretty else serialize(root)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Unpack a .docx into a directory of OOXML parts.")
    ap.add_argument("input", help="path to the .docx file")
    ap.add_argument("output_dir", help="directory to unpack into (use a temp dir)")
    ap.add_argument("--no-merge-runs", action="store_true", help="keep runs split exactly as stored")
    ap.add_argument("--no-pretty", action="store_true", help="write parts verbatim, not indented")
    args = ap.parse_args(argv)

    try:
        parts = read_parts(args.input)
    except Exception as exc:  # surface the reason; do not extract anything unsafe
        sys.stderr.write(f"error: {exc}\n")
        return 1

    out_dir = args.output_dir
    for name, data in parts.items():
        body = render_part(name, data, not args.no_merge_runs, not args.no_pretty)
        # read_parts already rejected traversal, but re-check after join as defence in depth.
        target = os.path.normpath(os.path.join(out_dir, name))
        if os.path.commonpath([os.path.abspath(target), os.path.abspath(out_dir)]) != os.path.abspath(out_dir):
            sys.stderr.write(f"error: refusing to write outside output dir: {name}\n")
            return 1
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "wb") as fh:
            fh.write(body)

    print(f"unpacked {len(parts)} parts into {out_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
