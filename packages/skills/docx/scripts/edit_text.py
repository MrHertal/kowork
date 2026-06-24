#!/usr/bin/env python3
"""Replace the first occurrence of a phrase in a .docx, optionally as a redline.

This is the turnkey edit. It finds the phrase inside a single run of
word/document.xml and either substitutes the text in place (default) or, with
--tracked, authors it as a Word change: the old text wrapped in w:del/w:delText
and the new text in w:ins/w:t, so a reviewer can accept or reject it.

The phrase must lie within one run. Word breaks text into runs at every
formatting boundary, so a phrase that spans runs (part bold, a stray
spell-check split, ...) lives in separate w:t elements and won't match; target a
smaller substring that sits in one run, the same constraint as comment.py.

Usage:
    kowork-python edit_text.py <in.docx> --find "OLD" --replace "NEW" -o out.docx
    kowork-python edit_text.py <in.docx> --find "OLD" --replace "NEW" --tracked \\
        [--author NAME] [--initials AB] [--date ISO8601] -o out.docx
"""

from __future__ import annotations

import argparse
import copy
import sys
from datetime import datetime, timezone

from lxml import etree

from oxml import parse_xml, qn, read_parts, refuse_inplace, refuse_macro_output, serialize, smarten_quotes, write_parts

XML_SPACE = qn("xml:space")


def el(tag: str, **attrs: str):
    node = etree.Element(qn(tag))
    for key, value in attrs.items():
        node.set(qn(key.replace("_", ":")), value)
    return node


def set_preserve_if_needed(leaf) -> None:
    if leaf.text and leaf.text != leaf.text.strip():
        leaf.set(XML_SPACE, "preserve")


def run_with_text(template_run, text: str, tag: str = "w:t"):
    """Clone a run, keep its w:rPr, but carry exactly ``text`` in ``tag``.

    ``tag`` is w:t for normal/inserted text and w:delText for deleted text;
    inside w:del the text element must be w:delText or Word drops it.
    """
    new_run = copy.deepcopy(template_run)
    for child in list(new_run):
        if child.tag in (qn("w:t"), qn("w:delText")):
            new_run.remove(child)
    leaf = etree.SubElement(new_run, qn(tag))
    leaf.text = text
    set_preserve_if_needed(leaf)
    return new_run


def change_wrapper(wrapper_tag: str, template_run, text: str, text_tag: str,
                   wid: int, author: str, date: str):
    """Build a w:ins or w:del wrapping one run that carries ``text``."""
    wrapper = el(wrapper_tag, w_id=str(wid), w_author=author, w_date=date)
    wrapper.append(run_with_text(template_run, text, text_tag))
    return wrapper


def find_run_with_phrase(doc_root, phrase: str):
    for t in doc_root.iter(qn("w:t")):
        if t.text and phrase in t.text:
            run = t.getparent()
            if run is None:
                continue
            parent = run.getparent()
            if parent is None:
                continue
            return t, run, parent
    return None, None, None


def phrase_spans_runs(doc_root, phrase: str) -> bool:
    """True if the phrase appears in a paragraph's text but not in one run."""
    for p in doc_root.iter(qn("w:p")):
        joined = "".join(t.text or "" for t in p.iter(qn("w:t")))
        if phrase in joined:
            return True
    return False


def next_change_id(doc_root) -> int:
    """Smallest id free across all existing w:ins / w:del revisions."""
    ids = []
    for tag in ("w:ins", "w:del"):
        for e in doc_root.iter(qn(tag)):
            value = e.get(qn("w:id"), "")
            if value.lstrip("-").isdigit():
                ids.append(int(value))
    return (max(ids) + 1) if ids else 0


def replace_plain(t, phrase: str, replacement: str) -> None:
    before, _, after = t.text.partition(phrase)
    t.text = before + replacement + after
    set_preserve_if_needed(t)


def replace_tracked(run, parent, t, phrase: str, replacement: str,
                    base_id: int, author: str, date: str) -> None:
    before, _, after = t.text.partition(phrase)
    index = parent.index(run)
    parent.remove(run)

    nodes = []
    if before:
        nodes.append(run_with_text(run, before))
    # Deletion first (strikethrough), then insertion -- reads as old -> new.
    nodes.append(change_wrapper("w:del", run, phrase, "w:delText", base_id, author, date))
    nodes.append(change_wrapper("w:ins", run, replacement, "w:t", base_id + 1, author, date))
    if after:
        nodes.append(run_with_text(run, after))

    for offset, node in enumerate(nodes):
        parent.insert(index + offset, node)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Replace the first occurrence of a phrase in a .docx.")
    ap.add_argument("input", help="path to the .docx file")
    ap.add_argument("--find", required=True, help="phrase to replace (within one run)")
    ap.add_argument("--replace", required=True, help="replacement text")
    ap.add_argument("--tracked", action="store_true", help="author the edit as a tracked change (redline)")
    ap.add_argument("--no-smart-quotes", action="store_true", help="insert quotes/apostrophes literally instead of typographic ones")
    ap.add_argument("--author", default="Kowork", help="revision author (tracked mode)")
    # Accepted for symmetry with comment.py, but OOXML's CT_TrackChange has no
    # initials attribute, so it is not emitted on a w:ins / w:del revision.
    ap.add_argument("--initials", default="KW", help="ignored for revisions; kept for CLI symmetry")
    ap.add_argument("--date", default=None, help="ISO 8601 timestamp; default is now (UTC)")
    ap.add_argument("-o", "--out", required=True, help="output path (a new .docx; this skill never edits in place)")
    args = ap.parse_args(argv)

    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    replacement = args.replace if args.no_smart_quotes else smarten_quotes(args.replace)

    try:
        refuse_macro_output(args.out)
        refuse_inplace(args.out, args.input)
        parts = read_parts(args.input)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    if "word/document.xml" not in parts:
        sys.stderr.write("error: package has no word/document.xml\n")
        return 1

    doc_root = parse_xml(parts["word/document.xml"])
    t, run, parent = find_run_with_phrase(doc_root, args.find)
    if t is None:
        if phrase_spans_runs(doc_root, args.find):
            sys.stderr.write(f"error: phrase spans multiple runs: {args.find!r}; target a smaller substring that sits in one run\n")
        else:
            sys.stderr.write(f"error: phrase not found within a single run: {args.find!r}\n")
        return 1

    if args.tracked:
        replace_tracked(run, parent, t, args.find, replacement, next_change_id(doc_root), args.author, date)
        how = f"tracked change by {args.author}"
    else:
        replace_plain(t, args.find, replacement)
        how = "plain replacement"

    parts["word/document.xml"] = serialize(doc_root)
    out = args.out
    write_parts(out, parts)
    print(f"replaced {args.find!r} -> {replacement!r} ({how}); wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
