#!/usr/bin/env python3
"""Validate an OOXML word package with structural / well-formedness checks.

The ECMA-376 / ISO-IEC 29500 XSD schemas are not bundled (their redistribution
terms are not clearly permissive), so this does not do full schema validation.
Instead it enforces the invariants that actually break Word in practice:

  * every XML part is well-formed (parsed with the hardened parser);
  * the package wiring exists -- [Content_Types].xml declares the main document
    part, _rels/.rels points at it, and that part is a w:document with a w:body;
  * relationship ids referenced from document.xml resolve in its .rels part
    (a dangling r:id is the usual cause of "Word found unreadable content");
  * tracked-change text lives in the right element: text inside w:del must be
    w:delText, not w:t, and w:delText must not appear outside w:del;
  * significant leading/trailing whitespace in w:t / w:delText carries
    xml:space="preserve".

With --fix it repairs the last two (they are safe, local rewrites of
word/document.xml) and writes the result back. Schema/well-formedness errors are
reported but never auto-guessed.

Usage:
    kowork-python validate.py <input.docx | unpacked_dir> [--fix] [-o out.docx]
"""

from __future__ import annotations

import argparse
import os
import sys
from collections import OrderedDict

from lxml import etree

from oxml import (
    CT_DOCUMENT,
    DocxError,
    NS,
    RT_OFFICE_DOCUMENT,
    parse_xml,
    qn,
    read_parts,
    refuse_inplace,
    refuse_macro_output,
    serialize,
    write_parts,
)

DOCUMENT_PART = "word/document.xml"
DOCUMENT_RELS = "word/_rels/document.xml.rels"
XML_SPACE = qn("xml:space")


class Issue:
    __slots__ = ("severity", "message")

    def __init__(self, severity: str, message: str):
        self.severity = severity
        self.message = message

    def __str__(self) -> str:
        return f"[{self.severity}] {self.message}"


def load_package(path: str):
    if os.path.isdir(path):
        parts: "OrderedDict[str, bytes]" = OrderedDict()
        for dirpath, _dirs, files in os.walk(path):
            for name in files:
                full = os.path.join(dirpath, name)
                arc = os.path.relpath(full, path).replace(os.sep, "/")
                with open(full, "rb") as fh:
                    parts[arc] = fh.read()
        return parts, "dir"
    return read_parts(path), "zip"


def needs_preserve(text: str | None) -> bool:
    return bool(text) and text != text.strip()


def nearest_change_ancestor(elem) -> str | None:
    """Return 'del', 'ins', or None for the closest tracked-change ancestor."""
    for anc in elem.iterancestors():
        if anc.tag == qn("w:del"):
            return "del"
        if anc.tag == qn("w:ins"):
            return "ins"
    return None


def check_well_formed(parts, issues):
    roots = {}
    for name, data in parts.items():
        if not (name.endswith(".xml") or name.endswith(".rels")):
            continue
        try:
            roots[name] = parse_xml(data)
        except Exception as exc:
            issues.append(Issue("error", f"{name}: not well-formed XML: {exc}"))
    return roots


def check_content_types(roots, issues):
    root = roots.get("[Content_Types].xml")
    if root is None:
        issues.append(Issue("error", "[Content_Types].xml is missing"))
        return
    overrides = {
        e.get("PartName"): e.get("ContentType")
        for e in root.iter(qn("ct:Override"))
    }
    if overrides.get("/word/document.xml") != CT_DOCUMENT:
        issues.append(Issue("error", "[Content_Types].xml has no main-document Override for /word/document.xml"))


def check_root_relationships(parts, roots, issues):
    root = roots.get("_rels/.rels")
    if root is None:
        issues.append(Issue("error", "_rels/.rels is missing"))
        return
    targets = []
    for rel in root.iter(qn("rel:Relationship")):
        if rel.get("Type") == RT_OFFICE_DOCUMENT:
            targets.append(rel.get("Target"))
    if not targets:
        issues.append(Issue("error", "_rels/.rels has no officeDocument relationship"))
        return
    for target in targets:
        normalized = target.lstrip("/")
        if normalized not in parts:
            issues.append(Issue("error", f"officeDocument relationship target missing: {target}"))


def check_document(roots, issues):
    root = roots.get(DOCUMENT_PART)
    if root is None:
        issues.append(Issue("error", f"{DOCUMENT_PART} is missing or unparseable"))
        return None
    if root.tag != qn("w:document"):
        issues.append(Issue("error", f"{DOCUMENT_PART} root is {root.tag}, expected w:document"))
        return root
    if root.find(qn("w:body")) is None:
        issues.append(Issue("error", f"{DOCUMENT_PART} has no w:body"))
    return root


def check_dangling_rels(doc_root, roots, parts, issues):
    if doc_root is None:
        return
    r_ns = "{%s}" % NS["r"]
    referenced = set()
    for elem in doc_root.iter():
        for attr, value in elem.attrib.items():
            if attr.startswith(r_ns):
                referenced.add(value)
    if not referenced:
        return
    rels_root = roots.get(DOCUMENT_RELS)
    if rels_root is None:
        issues.append(Issue("error", f"document.xml references relationships but {DOCUMENT_RELS} is missing"))
        return
    known = {rel.get("Id") for rel in rels_root.iter(qn("rel:Relationship"))}
    for rid in sorted(referenced - known):
        issues.append(Issue("error", f"dangling relationship id referenced by document.xml: {rid}"))


def check_runs(doc_root, issues, fix: bool):
    """Tracked-change container + xml:space checks. Returns number fixed."""
    if doc_root is None:
        return 0
    fixed = 0
    for t in list(doc_root.iter(qn("w:t"))):
        if nearest_change_ancestor(t) == "del":
            msg = "w:t inside w:del should be w:delText"
            if fix:
                t.tag = qn("w:delText")
                fixed += 1
            else:
                issues.append(Issue("error", msg))
    for d in list(doc_root.iter(qn("w:delText"))):
        if nearest_change_ancestor(d) != "del":
            msg = "w:delText outside w:del should be w:t"
            if fix:
                d.tag = qn("w:t")
                fixed += 1
            else:
                issues.append(Issue("error", msg))
    for leaf in doc_root.iter(qn("w:t"), qn("w:delText")):
        if needs_preserve(leaf.text) and leaf.get(XML_SPACE) != "preserve":
            if fix:
                leaf.set(XML_SPACE, "preserve")
                fixed += 1
            else:
                issues.append(Issue("warn", f"{etree.QName(leaf).localname} has edge whitespace without xml:space=\"preserve\""))
    return fixed


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Validate / repair an OOXML word package.")
    ap.add_argument("input", help="path to a .docx file or an unpacked directory")
    ap.add_argument("--fix", action="store_true", help="apply safe repairs to word/document.xml")
    ap.add_argument("-o", "--out", help="write the fixed .docx here (required when fixing a packed file; a dir is fixed in place)")
    args = ap.parse_args(argv)

    try:
        parts, kind = load_package(args.input)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    issues: list[Issue] = []
    roots = check_well_formed(parts, issues)
    check_content_types(roots, issues)
    check_root_relationships(parts, roots, issues)
    doc_root = check_document(roots, issues)
    check_dangling_rels(doc_root, roots, parts, issues)
    fixed = check_runs(doc_root, issues, args.fix)

    if args.fix and fixed and doc_root is not None:
        parts[DOCUMENT_PART] = serialize(doc_root)
        if kind == "zip":
            if not args.out:
                sys.stderr.write(
                    "error: writing fixes to a packed .docx needs -o (this skill does "
                    "not edit in place); pass -o out.docx\n"
                )
                return 1
            try:
                refuse_macro_output(args.out)
                refuse_inplace(args.out, args.input)
            except DocxError as exc:
                sys.stderr.write(f"error: {exc}\n")
                return 1
            write_parts(args.out, parts)
            print(f"applied {fixed} fix(es); wrote {args.out}")
        else:
            with open(os.path.join(args.input, DOCUMENT_PART), "wb") as fh:
                fh.write(parts[DOCUMENT_PART])
            print(f"applied {fixed} fix(es) to {os.path.join(args.input, DOCUMENT_PART)}")

    errors = [i for i in issues if i.severity == "error"]
    for issue in issues:
        sys.stderr.write(str(issue) + "\n")

    if errors:
        sys.stderr.write(f"FAILED: {len(errors)} error(s), {len(issues) - len(errors)} warning(s)\n")
        return 1
    print(f"OK: valid package ({len(issues)} warning(s))")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
