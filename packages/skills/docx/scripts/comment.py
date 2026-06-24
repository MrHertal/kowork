#!/usr/bin/env python3
"""Attach a Word comment (or a threaded reply) to a .docx.

Comments are a multi-part edit, which is the instructive part:

  1. word/document.xml  -- wrap the commented text in w:commentRangeStart /
     w:commentRangeEnd (id N) and add a run holding w:commentReference (id N).
  2. word/comments.xml   -- a w:comments part with one w:comment per id; each
     comment's w:p carries a w14:paraId so it can be threaded.
  3. word/commentsExtended.xml -- a w15:commentEx per comment carrying its
     resolved state (w15:done) and, for a reply, its parent (w15:paraIdParent).
  4. [Content_Types].xml  -- Overrides declaring both comment content types.
  5. word/_rels/document.xml.rels -- relationships to comments.xml and
     commentsExtended.xml.

Miss any wiring and Word reports the file as corrupt. To cover exactly the
matched phrase we split its run into before / match / after (the run-splitting
gotcha): a comment range is delimited by sibling markers, not by nesting, so the
markers go *around* the matched run inside the same paragraph.

A new comment anchors to --text (which must lie within a single run; if it spans
runs, target a smaller substring or merge runs first with unpack.py). A reply
(--parent N) attaches to existing comment N instead and takes no --text.

Usage:
    kowork-python comment.py <in.docx> --text "phrase" --comment "note" \\
        [--author NAME] [--initials AB] [--date ISO8601] -o out.docx
    kowork-python comment.py <in.docx> --parent 0 --comment "reply" -o out.docx
"""

from __future__ import annotations

import argparse
import copy
import secrets
import sys
from datetime import datetime, timezone

from lxml import etree

from oxml import (
    CT_COMMENTS,
    CT_COMMENTS_EXTENDED,
    NS,
    RT_COMMENTS,
    RT_COMMENTS_EXTENDED,
    parse_xml,
    qn,
    read_parts,
    refuse_inplace,
    refuse_macro_output,
    serialize,
    smarten_quotes,
    write_parts,
)

XML_SPACE = qn("xml:space")


def el(tag: str, **attrs: str):
    node = etree.Element(qn(tag))
    for key, value in attrs.items():
        node.set(qn(key.replace("_", ":")), value)
    return node


def set_preserve_if_needed(t_elem) -> None:
    if t_elem.text and t_elem.text != t_elem.text.strip():
        t_elem.set(XML_SPACE, "preserve")


def run_with_text(template_run, text: str):
    """Clone a run, keeping its w:rPr, but carrying exactly ``text``."""
    new_run = copy.deepcopy(template_run)
    for child in list(new_run):
        if child.tag in (qn("w:t"), qn("w:delText")):
            new_run.remove(child)
    t = etree.SubElement(new_run, qn("w:t"))
    t.text = text
    set_preserve_if_needed(t)
    return new_run


def reference_run(cid: str):
    run = etree.Element(qn("w:r"))
    etree.SubElement(run, qn("w:commentReference")).set(qn("w:id"), cid)
    return run


def next_comment_id(comments_root) -> int:
    if comments_root is None:
        return 0
    ids = [int(c.get(qn("w:id"), "-1")) for c in comments_root.iter(qn("w:comment"))]
    return (max(ids) + 1) if ids else 0


def next_rel_id(rels_root) -> str:
    nums = []
    for rel in rels_root.iter(qn("rel:Relationship")):
        rid = rel.get("Id", "")
        if rid.startswith("rId") and rid[3:].isdigit():
            nums.append(int(rid[3:]))
    return f"rId{(max(nums) + 1) if nums else 1}"


def gen_para_id(used: set[str]) -> str:
    """A fresh 8-hex-digit w14:paraId not already in use."""
    while True:
        pid = format(secrets.randbits(32), "08X")
        if pid not in used:
            return pid


def existing_para_ids(comments_root) -> set[str]:
    ids: set[str] = set()
    if comments_root is not None:
        for p in comments_root.iter(qn("w:p")):
            pid = p.get(qn("w14:paraId"))
            if pid:
                ids.add(pid)
    return ids


def comment_para_id(comments_root, comment_id: str) -> str | None:
    if comments_root is None:
        return None
    for c in comments_root.iter(qn("w:comment")):
        if c.get(qn("w:id")) == comment_id:
            p = c.find(qn("w:p"))
            return p.get(qn("w14:paraId")) if p is not None else None
    return None


def anchor_comment(doc_root, phrase: str, cid: str) -> bool:
    for t in doc_root.iter(qn("w:t")):
        if t.text and phrase in t.text:
            run = t.getparent()
            parent = run.getparent() if run is not None else None
            if run is None or parent is None:
                continue
            before, _, after = t.text.partition(phrase)
            index = parent.index(run)
            parent.remove(run)

            new_nodes = []
            if before:
                new_nodes.append(run_with_text(run, before))
            new_nodes.append(el("w:commentRangeStart", w_id=cid))
            new_nodes.append(run_with_text(run, phrase))
            new_nodes.append(el("w:commentRangeEnd", w_id=cid))
            new_nodes.append(reference_run(cid))
            if after:
                new_nodes.append(run_with_text(run, after))

            for offset, node in enumerate(new_nodes):
                parent.insert(index + offset, node)
            return True
    return False


def anchor_reply(doc_root, parent_id: str, reply_id: str) -> bool:
    """Place the reply's reference (with an empty range) after the parent's."""
    for ref in doc_root.iter(qn("w:commentReference")):
        if ref.get(qn("w:id")) == parent_id:
            run = ref.getparent()
            parent = run.getparent() if run is not None else None
            if parent is None:
                continue
            index = parent.index(run)
            nodes = [
                el("w:commentRangeStart", w_id=reply_id),
                el("w:commentRangeEnd", w_id=reply_id),
                reference_run(reply_id),
            ]
            for offset, node in enumerate(nodes):
                parent.insert(index + 1 + offset, node)
            return True
    return False


def upsert_comments_part(parts, cid, author, date, initials, text, para_id) -> None:
    if "word/comments.xml" in parts:
        root = parse_xml(parts["word/comments.xml"])
    else:
        root = etree.Element(qn("w:comments"), nsmap={"w": NS["w"], "w14": NS["w14"]})
    comment = el("w:comment", w_id=cid, w_author=author, w_date=date, w_initials=initials)
    p = etree.SubElement(comment, qn("w:p"))
    p.set(qn("w14:paraId"), para_id)
    r = etree.SubElement(p, qn("w:r"))
    t = etree.SubElement(r, qn("w:t"))
    t.text = text
    set_preserve_if_needed(t)
    root.append(comment)
    parts["word/comments.xml"] = serialize(root)


def upsert_comments_extended(parts, para_id, parent_para_id) -> None:
    name = "word/commentsExtended.xml"
    if name in parts:
        root = parse_xml(parts[name])
    else:
        root = etree.Element(qn("w15:commentsEx"), nsmap={"w15": NS["w15"]})
    ex = etree.SubElement(root, qn("w15:commentEx"))
    ex.set(qn("w15:paraId"), para_id)
    if parent_para_id:
        ex.set(qn("w15:paraIdParent"), parent_para_id)
    ex.set(qn("w15:done"), "0")
    parts[name] = serialize(root)


def ensure_content_type(parts, part_name, content_type) -> None:
    root = parse_xml(parts["[Content_Types].xml"])
    for override in root.iter(qn("ct:Override")):
        if override.get("PartName") == part_name:
            return
    override = etree.SubElement(root, qn("ct:Override"))
    override.set("PartName", part_name)
    override.set("ContentType", content_type)
    parts["[Content_Types].xml"] = serialize(root)


def ensure_relationship(parts, rel_type, target) -> None:
    name = "word/_rels/document.xml.rels"
    if name in parts:
        root = parse_xml(parts[name])
    else:
        root = etree.Element(qn("rel:Relationships"), nsmap={None: NS["rel"]})
    for rel in root.iter(qn("rel:Relationship")):
        if rel.get("Type") == rel_type:
            parts[name] = serialize(root)
            return
    rel = etree.SubElement(root, qn("rel:Relationship"))
    rel.set("Id", next_rel_id(root))
    rel.set("Type", rel_type)
    rel.set("Target", target)
    parts[name] = serialize(root)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Add a Word comment or threaded reply to a .docx.")
    ap.add_argument("input", help="path to the .docx file")
    ap.add_argument("--text", help="phrase to anchor a new comment to (within one run)")
    ap.add_argument("--comment", required=True, help="the comment body text")
    ap.add_argument("--parent", type=int, default=None, help="reply to this existing comment id (no --text)")
    ap.add_argument("--author", default="Kowork", help="comment author name")
    ap.add_argument("--initials", default="KW", help="comment author initials")
    ap.add_argument("--date", default=None, help="ISO 8601 timestamp; default is now (UTC)")
    ap.add_argument("--no-smart-quotes", action="store_true", help="keep quotes/apostrophes literal in the comment body")
    ap.add_argument("-o", "--out", required=True, help="output path (a new .docx; this skill never edits in place)")
    args = ap.parse_args(argv)

    if args.parent is None and not args.text:
        sys.stderr.write("error: provide --text for a new comment, or --parent for a reply\n")
        return 2

    date = args.date or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    body = args.comment if args.no_smart_quotes else smarten_quotes(args.comment)

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
    comments_root = parse_xml(parts["word/comments.xml"]) if "word/comments.xml" in parts else None

    cid = str(next_comment_id(comments_root))
    para_id = gen_para_id(existing_para_ids(comments_root))

    if args.parent is not None:
        parent_id = str(args.parent)
        parent_para = comment_para_id(comments_root, parent_id)
        if parent_para is None:
            sys.stderr.write(f"error: parent comment id {parent_id} not found\n")
            return 1
        if not anchor_reply(doc_root, parent_id, cid):
            sys.stderr.write(f"error: could not locate comment reference for parent id {parent_id}\n")
            return 1
        where = f"reply to comment {parent_id}"
    else:
        parent_para = None
        if not anchor_comment(doc_root, args.text, cid):
            sys.stderr.write(f"error: phrase not found within a single run: {args.text!r}\n")
            return 1
        where = f"anchored to {args.text!r}"

    parts["word/document.xml"] = serialize(doc_root)
    upsert_comments_part(parts, cid, args.author, date, args.initials, body, para_id)
    upsert_comments_extended(parts, para_id, parent_para)
    ensure_content_type(parts, "/word/comments.xml", CT_COMMENTS)
    ensure_content_type(parts, "/word/commentsExtended.xml", CT_COMMENTS_EXTENDED)
    ensure_relationship(parts, RT_COMMENTS, "comments.xml")
    ensure_relationship(parts, RT_COMMENTS_EXTENDED, "commentsExtended.xml")

    out = args.out
    write_parts(out, parts)
    print(f"added comment id={cid} by {args.author} ({where}); wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
