"""Shared OOXML helpers for the docx skill.

A .docx file is an Open Packaging Conventions (OPC) ZIP container holding XML
"parts". This module centralises the two things every script needs: secure XML
parsing (a .docx may be attacker-supplied, so entity-expansion and XXE must be
refused) and bounded ZIP reading/writing (to refuse zip bombs and path
traversal). Keep all WordprocessingML namespace knowledge here so the rest of
the scripts stay short.
"""

from __future__ import annotations

import os
import re
import warnings
import zipfile
from collections import OrderedDict
from typing import Dict

from lxml import etree


class DocxError(Exception):
    """A user-facing failure; the mutating scripts print it as ``error: ...`` and exit 1."""


# WordprocessingML and OPC namespaces used across the scripts. The "xml" prefix
# is the reserved built-in namespace that carries xml:space.
NS: Dict[str, str] = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xml": "http://www.w3.org/XML/1998/namespace",
    # Microsoft extensions: w14 carries w:p paraId; w15 carries comment threading
    # (commentsExtended: paraId / paraIdParent / done).
    "w14": "http://schemas.microsoft.com/office/word/2010/wordml",
    "w15": "http://schemas.microsoft.com/office/word/2012/wordml",
}

# Canonical content types / relationship types referenced when adding parts.
CT_DOCUMENT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
CT_COMMENTS = "application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"
CT_COMMENTS_EXTENDED = "application/vnd.openxmlformats-officedocument.wordprocessingml.commentsExtended+xml"
RT_OFFICE_DOCUMENT = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"
RT_COMMENTS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments"
RT_COMMENTS_EXTENDED = "http://schemas.microsoft.com/office/2011/relationships/commentsExtended"

# Macro-enabled outputs the mutating scripts refuse to write: a .docm is read but
# macros are never authored here, and round-tripping one risks reshaping parts.
MACRO_EXTS = (".docm", ".dotm")

# ZIP guard rails. A legitimate document is far under these; exceeding them is a
# strong signal of a crafted package, so we refuse rather than expand it.
MAX_ENTRIES = 10_000
MAX_PART_BYTES = 300 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024


def qn(name: str) -> str:
    """Turn a ``prefix:local`` name into lxml Clark notation ``{uri}local``."""
    prefix, _, local = name.partition(":")
    if not local:
        raise ValueError(f"expected prefixed name like 'w:p', got {name!r}")
    try:
        return f"{{{NS[prefix]}}}{local}"
    except KeyError as exc:
        raise ValueError(f"unknown namespace prefix {prefix!r}") from exc


def secure_parser() -> etree.XMLParser:
    """An lxml parser hardened against the classic XML attacks.

    No DTD loading, no entity resolution, no network access, and no huge-tree
    bypass. This is the fallback when defusedxml's lxml frontend is absent.
    """
    return etree.XMLParser(
        resolve_entities=False,
        no_network=True,
        load_dtd=False,
        dtd_validation=False,
        huge_tree=False,
        recover=False,
    )


def _defused_screen(data: bytes) -> None:
    """Let defusedxml reject DTDs, entity definitions and external references.

    This is the project's preferred safety layer, but its lxml frontend is
    deprecated upstream and returns RestrictedElement trees whose API differs
    from plain lxml. So we use it only as a *screen*: parse-and-discard to
    trigger its checks, then build the real working tree with the hardened
    parser below. If defusedxml is unavailable we skip silently; a genuine
    security rejection raised here still propagates to the caller.
    """
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", DeprecationWarning)
            from defusedxml.lxml import fromstring as screen  # type: ignore
    except Exception:
        return
    screen(data)


def parse_xml(data: bytes) -> etree._Element:
    """Parse part bytes into a normal lxml element, refusing dangerous input.

    The hardened parser alone (no DTD load, no entity resolution, no network,
    no huge-tree) plus an explicit DOCTYPE refusal is a sufficient guard; the
    defusedxml screen above is defense in depth.
    """
    if isinstance(data, str):
        data = data.encode("utf-8")
    _defused_screen(data)
    root = etree.fromstring(data, parser=secure_parser())
    if root.getroottree().docinfo.doctype:
        raise ValueError("XML declares a DOCTYPE; refusing (possible XXE / entity expansion).")
    return root


def serialize(root: etree._Element) -> bytes:
    """Serialise an element back to standalone UTF-8 bytes for an OOXML part."""
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def serialize_pretty(root: etree._Element) -> bytes:
    """Serialise indented for human editing (used by unpack).

    lxml only indents element-only content, so text-bearing leaves (w:t /
    w:delText) keep their exact text and Word ignores the inter-element
    whitespace it adds between block elements.
    """
    return etree.tostring(
        root, xml_declaration=True, encoding="UTF-8", standalone=True, pretty_print=True
    )


def smarten_quotes(text: str) -> str:
    """Turn straight quotes/apostrophes into typographic ones for new prose.

    A heuristic "educate quotes": a quote at the start, or after whitespace / an
    opening bracket / an opening quote, opens; any other quote closes. Good
    enough for document prose. Callers expose --no-smart-quotes for code or
    literal output, and never run this over text matched against the document.
    """
    if not text:
        return text
    text = re.sub('(^|[\\s([{<\u2018\u201c])"', lambda m: m.group(1) + "\u201c", text)
    text = text.replace('"', "\u201d")
    text = re.sub("(^|[\\s([{<\u2018\u201c])'", lambda m: m.group(1) + "\u2018", text)
    text = text.replace("'", "\u2019")
    return text


def is_safe_member(name: str) -> bool:
    """Reject absolute paths and parent-directory traversal in ZIP names."""
    if not name or name.startswith("/") or name.startswith("\\"):
        return False
    segments = name.replace("\\", "/").split("/")
    return ".." not in segments


def read_parts(path: str) -> "OrderedDict[str, bytes]":
    """Read every file part of an OPC package, in archive order, with guards."""
    if not zipfile.is_zipfile(path):
        raise ValueError(f"{path} is not a valid ZIP/OOXML package")
    parts: "OrderedDict[str, bytes]" = OrderedDict()
    total = 0
    with zipfile.ZipFile(path) as zf:
        infos = zf.infolist()
        if len(infos) > MAX_ENTRIES:
            raise ValueError(f"package has {len(infos)} entries; refusing (> {MAX_ENTRIES}).")
        for info in infos:
            if info.is_dir():
                continue
            if not is_safe_member(info.filename):
                raise ValueError(f"unsafe member path: {info.filename!r}")
            if info.file_size > MAX_PART_BYTES:
                raise ValueError(f"part {info.filename!r} is {info.file_size} bytes; refusing.")
            total += info.file_size
            if total > MAX_TOTAL_BYTES:
                raise ValueError("uncompressed package exceeds size cap; refusing (possible zip bomb).")
            parts[info.filename] = zf.read(info.filename)
    return parts


def write_parts(path: str, parts: "OrderedDict[str, bytes]") -> None:
    """Write parts back to a deflate-compressed OPC package, preserving order."""
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for name, data in parts.items():
            zf.writestr(name, data)


def refuse_macro_output(out_path: str) -> None:
    """Reject a macro-enabled output path; the mutating scripts never author macros."""
    ext = os.path.splitext(out_path)[1].lower()
    if ext in MACRO_EXTS:
        raise DocxError(
            f"refusing to write a macro-enabled document ({ext}); macros are read "
            "but never authored here. Write a .docx instead."
        )


def refuse_inplace(out_path: str, source_path: str) -> None:
    """Block writing the result back over a file being read from."""
    try:
        same = os.path.realpath(out_path) == os.path.realpath(source_path)
    except OSError:
        same = os.path.abspath(out_path) == os.path.abspath(source_path)
    if same:
        raise DocxError(
            f"refusing to overwrite {source_path} in place; write the result to a "
            "different output path so the original is preserved"
        )
