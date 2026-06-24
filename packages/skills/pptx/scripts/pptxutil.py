"""Shared helpers for the pptx skill.

A .pptx is an Open Packaging Conventions (OPC) ZIP container of XML "parts",
the same shape as .docx and .xlsx. This module is the single source of truth
the pptx scripts (read, unpack, pack, slides, validate) share so each stays
short. It owns: the PresentationML/OPC namespaces, secure XML parsing (a deck
may be attacker-supplied, so DTDs, entity expansion and XXE must be refused),
bounded OPC ZIP reading/writing (to refuse zip bombs and path traversal),
EMU/geometry math plus the pure rectangle primitives the layout linter reuses,
opening a deck with python-pptx, and the output-safety refusals. Imported as
``from pptxutil import ...`` -- the script's own directory is on ``sys.path``
when run as ``kowork-python scripts/<name>.py``.

``create_pptx.cjs`` deliberately does NOT import this module: it is a
self-contained Node script (not Python) that builds decks on its own, so
nothing here needs to serve it.

Errors split by layer, matching the sibling skills: the low-level structural
helpers (``qn``, ``parse_xml``, ``read_parts``, ``write_parts``) raise
``ValueError``, while the user-facing entry points (``load`` and the
``refuse_*`` guards) raise ``PptxError``, which callers print as ``error: ...``
before exiting non-zero.
"""

from __future__ import annotations

import os
import warnings
import zipfile
from collections import OrderedDict

from lxml import etree
from pptx import Presentation
from pptx.exc import PackageNotFoundError


class PptxError(Exception):
    """A user-facing failure; callers print it as ``error: ...`` and exit 1."""


# PresentationML / DrawingML / OPC namespaces used across the scripts. The
# "xml" prefix is the reserved built-in namespace that carries xml:space and
# xml:lang.
NS: dict[str, str] = {
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "xml": "http://www.w3.org/XML/1998/namespace",
}


def qn(name: str) -> str:
    """Turn a ``prefix:local`` name into lxml Clark notation ``{uri}local``."""
    prefix, _, local = name.partition(":")
    if not local:
        raise ValueError(f"expected prefixed name like 'p:sldId', got {name!r}")
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

    This is the preferred safety layer, but its lxml frontend is deprecated
    upstream and returns RestrictedElement trees whose API differs from plain
    lxml. So we use it only as a *screen*: parse-and-discard to trigger its
    checks, then build the real working tree with the hardened parser below. If
    defusedxml is unavailable we skip silently; a genuine security rejection
    raised here still propagates to the caller.
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

    lxml only indents element-only content, so text-bearing leaves (a:t) keep
    their exact text and PowerPoint ignores the inter-element whitespace added
    between block elements.
    """
    return etree.tostring(
        root, xml_declaration=True, encoding="UTF-8", standalone=True, pretty_print=True
    )


def cell(value) -> str:
    """One value as a single-line, pipe-safe string for a Markdown table cell."""
    if value is None:
        return ""
    return " ".join(str(value).split()).replace("|", "\\|")


def format_table(rows) -> str:
    """Render ``rows`` (an iterable of iterables) as a GitHub-style pipe table.

    The first row is the header, followed by a separator line. Ragged rows are
    padded to the widest row. Returns ``""`` when there are no rows. Shared by
    the read and validate scripts so deck tables render identically everywhere.
    """
    cleaned = [[cell(c) for c in row] for row in rows]
    width = max((len(r) for r in cleaned), default=0)
    if width == 0:
        return ""
    for r in cleaned:
        r.extend([""] * (width - len(r)))
    header, *body = cleaned
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join(["---"] * width) + " |",
    ]
    for r in body:
        lines.append("| " + " | ".join(r) + " |")
    return "\n".join(lines)


# ZIP guard rails. A legitimate deck is far under these; exceeding them is a
# strong signal of a crafted package, so we refuse rather than expand it.
MAX_ENTRIES = 10_000
MAX_PART_BYTES = 300 * 1024 * 1024
MAX_TOTAL_BYTES = 1024 * 1024 * 1024


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


# DrawingML positions and sizes are in English Metric Units (EMU). These two
# conversions are exact by definition of the unit.
EMU_PER_INCH = 914400
EMU_PER_POINT = 12700


def emu_to_inches(emu: float) -> float:
    """EMU to inches (914400 EMU == 1 inch)."""
    return emu / EMU_PER_INCH


def inches_to_emu(inches: float) -> int:
    """Inches to whole EMU (1 inch == 914400 EMU)."""
    return round(inches * EMU_PER_INCH)


def emu_to_points(emu: float) -> float:
    """EMU to typographic points (12700 EMU == 1 point)."""
    return emu / EMU_PER_POINT


def points_to_emu(points: float) -> int:
    """Typographic points to whole EMU (1 point == 12700 EMU)."""
    return round(points * EMU_PER_POINT)


def shape_bbox_inches(shape) -> tuple[float, float, float, float] | None:
    """A shape's ``(left, top, width, height)`` in inches, or ``None`` if unresolved.

    python-pptx resolves a placeholder's geometry by walking
    slide -> layout -> master, so most shapes report real EMU. A dimension is
    ``None`` only when no level in that chain defines it; we treat any ``None``
    among the four as "geometry unresolved" and return ``None`` so the linter
    can flag the shape as unchecked rather than guess a position.
    """
    left, top, width, height = shape.left, shape.top, shape.width, shape.height
    if left is None or top is None or width is None or height is None:
        return None
    return (
        emu_to_inches(left),
        emu_to_inches(top),
        emu_to_inches(width),
        emu_to_inches(height),
    )


def rect_intersection_area(a, b) -> float:
    """Area of the overlap between two ``(left, top, width, height)`` rectangles.

    Returns ``0.0`` when they do not overlap; edges that merely touch count as
    no overlap. Unit-agnostic -- the result is in whatever squared unit the
    inputs share (inches throughout this skill). The layout linter uses this to
    spot shapes that collide.
    """
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    dx = min(ax + aw, bx + bw) - max(ax, bx)
    dy = min(ay + ah, by + bh) - max(ay, by)
    if dx <= 0 or dy <= 0:
        return 0.0
    return dx * dy


def rect_within_slide(rect, slide_width: float, slide_height: float, *, tol: float = 1e-6) -> bool:
    """Whether ``rect`` lies fully inside a ``slide_width`` x ``slide_height`` slide.

    All four values share one unit (inches in this skill). ``tol`` absorbs the
    floating-point error of EMU<->inch conversion so a shape sitting flush
    against an edge is not falsely flagged as overflowing. The layout linter
    uses this to catch content that runs off the slide.
    """
    left, top, width, height = rect
    return (
        left >= -tol
        and top >= -tol
        and left + width <= slide_width + tol
        and top + height <= slide_height + tol
    )


# Extensions python-pptx can open. Other PowerPoint formats (.ppt, .odp) are
# different containers it cannot read.
READABLE_EXTS = (".pptx", ".pptm", ".potx", ".ppsx")

# Macro-enabled outputs the mutating scripts refuse to write: macros are read
# but never authored, and round-tripping one risks silently reshaping parts.
MACRO_EXTS = (".pptm", ".potm", ".ppsm")


def load(path: str):
    """Open a presentation, turning the common failures into a clean ``PptxError``.

    Returns the python-pptx ``Presentation`` the factory builds.

    Reading a macro-enabled ``.pptm`` is fine (its macros are simply ignored on
    read) -- this helper never writes, and the mutating scripts refuse to *save*
    a macro-enabled target via ``refuse_macro_output``.
    """
    if not os.path.isfile(path):
        raise PptxError(f"no such file: {path}")
    ext = os.path.splitext(path)[1].lower()
    if ext not in READABLE_EXTS:
        raise PptxError(
            f"unsupported file type {ext or '(none)'}: expected one of "
            f"{', '.join(READABLE_EXTS)} (python-pptx cannot read .ppt or .odp)"
        )
    try:
        return Presentation(path)
    except PackageNotFoundError:
        raise PptxError(f"not a valid presentation (not an OPC package): {path}")
    except Exception as exc:
        raise PptxError(f"cannot open {path}: {exc}")


def refuse_macro_output(out_path: str) -> None:
    """Reject a macro-enabled output path; the mutating scripts never write one."""
    ext = os.path.splitext(out_path)[1].lower()
    if ext in MACRO_EXTS:
        raise PptxError(
            f"refusing to write a macro-enabled presentation ({ext}); macros are "
            "read but never authored here. Write a .pptx instead."
        )


def refuse_inplace(out_path: str, source_path: str) -> None:
    """Block writing the result back over a file we are reading from."""
    try:
        same = os.path.realpath(out_path) == os.path.realpath(source_path)
    except OSError:
        same = os.path.abspath(out_path) == os.path.abspath(source_path)
    if same:
        raise PptxError(
            f"refusing to overwrite {source_path} in place; round-trips can be "
            "lossy, so write to a different output path"
        )


def _self_test() -> None:
    """Exercise the pure helpers and prove a real .pptx round-trips through the
    ZIP layer. Run via ``kowork-python pptxutil.py``; leaves no artifacts."""
    import shutil
    import tempfile

    assert qn("p:sldId") == "{http://schemas.openxmlformats.org/presentationml/2006/main}sldId"
    assert qn("xml:space") == "{http://www.w3.org/XML/1998/namespace}space"
    for bad in ("sldId", "z:foo"):
        try:
            qn(bad)
        except ValueError:
            pass
        else:
            raise AssertionError(f"qn({bad!r}) should have raised")
    print("ok: qn")

    snippet = b'<p:sldId xmlns:p="%s" r:id="rId2" xmlns:r="%s"/>' % (
        NS["p"].encode(),
        NS["r"].encode(),
    )
    root = parse_xml(snippet)
    assert root.tag == qn("p:sldId")
    assert root.get(qn("r:id")) == "rId2"
    assert serialize(root).startswith(b"<?xml")
    assert b"\n" in serialize_pretty(root)
    for doctype in (b"<!DOCTYPE x [<!ENTITY e 'v'>]><x/>", b"<!DOCTYPE x><x/>"):
        try:
            parse_xml(doctype)
        except ValueError:
            pass
        else:
            raise AssertionError("parse_xml should refuse a DOCTYPE")
    print("ok: parse_xml / serialize / DOCTYPE refusal")

    for inches in (0.0, 0.5, 7.5, 13.333):
        assert abs(emu_to_inches(inches_to_emu(inches)) - inches) < 1e-6
    assert inches_to_emu(1) == EMU_PER_INCH
    assert points_to_emu(1) == EMU_PER_POINT
    assert isinstance(inches_to_emu(2), int)
    print("ok: emu/inch/point round-trip")

    assert rect_intersection_area((0, 0, 2, 2), (1, 1, 2, 2)) == 1.0
    assert rect_intersection_area((0, 0, 1, 1), (2, 2, 1, 1)) == 0.0
    assert rect_intersection_area((0, 0, 1, 1), (1, 0, 1, 1)) == 0.0
    assert rect_within_slide((0.5, 0.5, 2, 2), 10, 7.5)
    assert rect_within_slide((0, 0, 10, 7.5), 10, 7.5)
    assert not rect_within_slide((9, 1, 2, 2), 10, 7.5)
    assert not rect_within_slide((-0.1, 1, 1, 1), 10, 7.5)
    print("ok: rect intersection / slide bounds")

    assert is_safe_member("ppt/presentation.xml")
    assert not is_safe_member("../evil")
    assert not is_safe_member("/abs")
    print("ok: is_safe_member")

    assert cell(None) == "" and cell("a | b") == "a \\| b" and cell(" x  y ") == "x y"
    table = format_table([["H1", "H2"], ["a", "b|c"]])
    assert table.splitlines() == ["| H1 | H2 |", "| --- | --- |", "| a | b\\|c |"]
    assert format_table([]) == ""
    print("ok: cell / format_table")

    tmp = tempfile.mkdtemp(prefix="pptxutil-selftest-")
    try:
        src = os.path.join(tmp, "deck.pptx")
        prs = Presentation()
        prs.slides.add_slide(prs.slide_layouts[1])
        prs.save(src)

        loaded = load(src)
        bbox = shape_bbox_inches(loaded.slides[0].placeholders[0])
        assert bbox is not None and len(bbox) == 4 and all(isinstance(v, float) for v in bbox)

        parts = read_parts(src)
        assert "ppt/presentation.xml" in parts
        out = os.path.join(tmp, "rewritten.pptx")
        write_parts(out, parts)
        reopened = load(out)
        assert len(reopened.slides) == 1
        print(f"ok: read_parts/write_parts round-trip ({len(parts)} parts; bbox={tuple(round(v, 3) for v in bbox)})")

        try:
            refuse_macro_output(os.path.join(tmp, "x.pptm"))
        except PptxError:
            pass
        else:
            raise AssertionError("refuse_macro_output should reject .pptm")
        try:
            refuse_inplace(src, src)
        except PptxError:
            pass
        else:
            raise AssertionError("refuse_inplace should reject same path")
        print("ok: refuse_macro_output / refuse_inplace")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("all self-tests passed")


if __name__ == "__main__":
    _self_test()
