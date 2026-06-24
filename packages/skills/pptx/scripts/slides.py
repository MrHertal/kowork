#!/usr/bin/env python3
"""Slide-level structure operations on a .pptx, working on the OPC parts directly.

One tool with a subcommand per operation. ``info`` is a read-only summary; the
rest reorder, delete, duplicate, add, or clean whole slides and write the result
to a new file. These edit the package wiring -- ``ppt/presentation.xml``'s
``<p:sldIdLst>``, the presentation rels, ``[Content_Types].xml``, and per-slide
rels -- never the slide *content* (hand-edit that via unpack.py / pack.py). The
two compose: reorder or drop whole slides here, edit text there.

Rules (consistent across the pptx skill):
  * Mutating subcommands always write to -o, never in place, and refuse to
    overwrite the input.
  * Mutating subcommands refuse a macro-enabled output: this skill never authors
    .pptm/.potm/.ppsm.
  * Every result is reopened after writing to fail fast on an unsound package.

Usage:
    kowork-python slides.py info <in.pptx>
    kowork-python slides.py reorder <in.pptx> -o <out.pptx> --order 3,1,2
    kowork-python slides.py delete <in.pptx> -o <out.pptx> --slides 2,4
    kowork-python slides.py duplicate <in.pptx> -o <out.pptx> --slide N [--to POS]
    kowork-python slides.py add <in.pptx> -o <out.pptx> --layout L [--to POS]
    kowork-python slides.py clean <in.pptx> -o <out.pptx>
"""

from __future__ import annotations

import argparse
import os
import posixpath
import re
import sys

from pptxutil import (
    NS,
    format_table,
    load,
    parse_xml,
    qn,
    read_parts,
    refuse_inplace,
    refuse_macro_output,
    serialize,
    write_parts,
)

PRESENTATION = "ppt/presentation.xml"
PRESENTATION_RELS = "ppt/_rels/presentation.xml.rels"
CONTENT_TYPES = "[Content_Types].xml"
ROOT_RELS = "_rels/.rels"

_REL_BASE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
RT_SLIDE = _REL_BASE + "slide"
RT_SLIDE_LAYOUT = _REL_BASE + "slideLayout"
RT_NOTES_SLIDE = _REL_BASE + "notesSlide"
CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml"

# Parts whose lifetime follows the slides; structural parts (masters, layouts,
# themes, presProps, ...) are never swept, even if a quirk left them unreferenced.
REMOVABLE_PREFIXES = (
    "ppt/slides/",
    "ppt/notesSlides/",
    "ppt/media/",
    "ppt/charts/",
    "ppt/embeddings/",
    "ppt/diagrams/",
)

_SLIDE_RE = re.compile(r"ppt/slides/slide(\d+)\.xml")
_LAYOUT_RE = re.compile(r"ppt/slideLayouts/slideLayout(\d+)\.xml")

# A minimal valid slide: an empty shape tree plus the master colour mapping.
EMPTY_SLIDE = (
    '<p:sld xmlns:a="{a}" xmlns:r="{r}" xmlns:p="{p}">'
    "<p:cSld><p:spTree>"
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
    "<p:grpSpPr/>"
    "</p:spTree></p:cSld>"
    "<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>"
    "</p:sld>"
).format(a=NS["a"], r=NS["r"], p=NS["p"])


class SlidesError(Exception):
    """A user-facing failure; main prints it as ``error: ...`` and exits 1."""


# --- OPC helpers -----------------------------------------------------------


def _rels_name_for(part: str) -> str:
    """The .rels part that carries ``part``'s relationships."""
    d, b = posixpath.dirname(part), posixpath.basename(part)
    return f"{d}/_rels/{b}.rels" if d else f"_rels/{b}.rels"


def _resolve(base_dir: str, target: str) -> str:
    """A relationship Target resolved to a normalized in-package part name."""
    if target.startswith("/"):
        return posixpath.normpath(target[1:])
    return posixpath.normpath(posixpath.join(base_dir, target) if base_dir else target)


def _relationships(rels_root):
    return rels_root.findall(qn("rel:Relationship"))


def _sldid_list(pres_root):
    lst = pres_root.find(qn("p:sldIdLst"))
    if lst is None:
        raise SlidesError("presentation.xml has no <p:sldIdLst>")
    return lst


def _sldids(lst):
    return lst.findall(qn("p:sldId"))


def _next_slide_number(parts) -> int:
    nums = [int(m.group(1)) for n in parts for m in [_SLIDE_RE.fullmatch(n)] if m]
    return max(nums, default=0) + 1


def _next_sldid_id(lst) -> int:
    # @id values are unique integers conventionally at or above 256.
    ids = [int(s.get("id")) for s in _sldids(lst) if (s.get("id") or "").isdigit()]
    return max(ids + [255]) + 1


def _next_rid(rels_root) -> str:
    nums = []
    for rel in _relationships(rels_root):
        rid = rel.get("Id") or ""
        if rid.startswith("rId") and rid[3:].isdigit():
            nums.append(int(rid[3:]))
    return "rId" + str(max(nums, default=0) + 1)


def _insert_sldid(lst, pos: int, slide_id: int, rid: str) -> None:
    node = lst.makeelement(qn("p:sldId"), {"id": str(slide_id), qn("r:id"): rid})
    children = _sldids(lst)
    if pos > len(children):
        lst.append(node)
    else:
        children[pos - 1].addprevious(node)


def _add_content_type_override(parts, part_name: str, content_type: str = CT_SLIDE) -> None:
    root = parse_xml(parts[CONTENT_TYPES])
    root.append(root.makeelement(qn("ct:Override"), {"PartName": part_name, "ContentType": content_type}))
    parts[CONTENT_TYPES] = serialize(root)


def _add_slide_presentation_rel(parts, target: str) -> str:
    root = parse_xml(parts[PRESENTATION_RELS])
    rid = _next_rid(root)
    root.append(root.makeelement(qn("rel:Relationship"), {"Id": rid, "Type": RT_SLIDE, "Target": target}))
    parts[PRESENTATION_RELS] = serialize(root)
    return rid


def _slide_layout_name(parts, slide_part: str) -> str:
    rels_part = _rels_name_for(slide_part)
    if rels_part not in parts:
        return "(no rels)"
    base = posixpath.dirname(slide_part)
    for rel in _relationships(parse_xml(parts[rels_part])):
        if rel.get("Type") == RT_SLIDE_LAYOUT:
            return posixpath.basename(_resolve(base, rel.get("Target") or ""))
    return "(none)"


def _title_snippet(parts, slide_part: str, limit: int = 40) -> str:
    """First substantive text on the slide, for a glanceable label."""
    root = parse_xml(parts[slide_part])
    for t in root.iter(qn("a:t")):
        text = " ".join((t.text or "").split())
        if len(text) >= 2:
            return text if len(text) <= limit else text[: limit - 1] + "\u2026"
    return ""


# --- Orphan cleanup (shared by delete and clean) ---------------------------


def _outgoing(parts, owner):
    """In-package targets referenced by ``owner``'s rels (``None`` = package root)."""
    if owner is None:
        rels_name, base = ROOT_RELS, ""
    else:
        rels_name, base = _rels_name_for(owner), posixpath.dirname(owner)
    if rels_name not in parts:
        return []
    out = []
    for rel in _relationships(parse_xml(parts[rels_name])):
        if rel.get("TargetMode") == "External":
            continue
        target = rel.get("Target")
        if target:
            out.append(_resolve(base, target))
    return out


def _reachable(parts) -> set[str]:
    """Parts reachable from the package root via the relationship graph.

    Anchored at the root (and presentation.xml): a slide is reached only through
    presentation.xml.rels, so an orphaned slide stays unreachable despite the
    back-reference its notes slide holds to it -- which would otherwise keep a
    deleted slide alive.
    """
    seen: set[str] = set()
    queue = list(_outgoing(parts, None)) + [PRESENTATION]
    while queue:
        part = queue.pop()
        if part in seen or part not in parts:
            continue
        seen.add(part)
        queue.extend(_outgoing(parts, part))
    return seen


def _strip_dangling_slide_rels(parts) -> None:
    """Drop slide rels whose r:id is no longer listed in <p:sldIdLst>."""
    live = {s.get(qn("r:id")) for s in _sldids(_sldid_list(parse_xml(parts[PRESENTATION])))}
    root = parse_xml(parts[PRESENTATION_RELS])
    removed = False
    for rel in list(_relationships(root)):
        if rel.get("Type") == RT_SLIDE and rel.get("Id") not in live:
            root.remove(rel)
            removed = True
    if removed:
        parts[PRESENTATION_RELS] = serialize(root)


def _remove_overrides(parts, removed_parts: set[str]) -> None:
    want = {"/" + n for n in removed_parts}
    root = parse_xml(parts[CONTENT_TYPES])
    removed = False
    for ov in list(root.findall(qn("ct:Override"))):
        if ov.get("PartName") in want:
            root.remove(ov)
            removed = True
    if removed:
        parts[CONTENT_TYPES] = serialize(root)


def clean_orphans(parts) -> set[str]:
    """Remove orphaned slides and any removable parts they alone referenced.

    Reachability is already transitive, so one sweep would suffice; the loop
    re-runs to a fixed point as a guard, since dropping a part removes its rels
    and so its outgoing edges (e.g. chart -> embedding).
    """
    _strip_dangling_slide_rels(parts)
    removed: set[str] = set()
    while True:
        reachable = _reachable(parts)
        drop = [
            n
            for n in parts
            if n.startswith(REMOVABLE_PREFIXES) and not n.endswith(".rels") and n not in reachable
        ]
        if not drop:
            break
        for n in drop:
            parts.pop(n, None)
            parts.pop(_rels_name_for(n), None)
            removed.add(n)
    if removed:
        _remove_overrides(parts, removed)
    return removed


# --- argument parsing helpers ----------------------------------------------


def _parse_positions(spec: str, count: int) -> list[int]:
    out: list[int] = []
    for tok in str(spec).split(","):
        tok = tok.strip()
        if not tok:
            continue
        if not tok.isdigit():
            raise SlidesError(f"invalid position {tok!r}; use comma-separated 1-based numbers")
        value = int(tok)
        if not 1 <= value <= count:
            raise SlidesError(f"position {value} out of range 1-{count}")
        out.append(value)
    if not out:
        raise SlidesError("no slide positions given")
    return out


def _layouts(parts) -> list[str]:
    found = [n for n in parts if _LAYOUT_RE.fullmatch(n)]
    return sorted(found, key=lambda n: int(_LAYOUT_RE.fullmatch(n).group(1)))


def _resolve_layout(parts, spec: str) -> str:
    """A layout part from a 1-based index (in file order) or a layout name."""
    layouts = _layouts(parts)
    if not layouts:
        raise SlidesError("this presentation has no slide layouts")
    if spec.isdigit():
        idx = int(spec)
        if not 1 <= idx <= len(layouts):
            raise SlidesError(f"layout index {idx} out of range 1-{len(layouts)}")
        return layouts[idx - 1]
    named = []
    for part in layouts:
        csld = parse_xml(parts[part]).find(qn("p:cSld"))
        name = csld.get("name") if csld is not None else None
        named.append(name or "?")
        if name == spec:
            return part
    raise SlidesError(f"no layout named {spec!r}; available: {', '.join(named)}")


def _finish(parts, args, message: str) -> int:
    write_parts(args.out, parts)
    try:
        load(args.out)
    except Exception as exc:
        try:
            os.remove(args.out)
        except OSError:
            pass
        raise SlidesError(f"produced an unreadable package ({exc}); not keeping it")
    print(f"{message} -> {args.out}")
    return 0


# --- subcommands -----------------------------------------------------------


def cmd_info(args: argparse.Namespace) -> int:
    parts = read_parts(args.input)
    pres = parse_xml(parts[PRESENTATION])
    rid_target = {
        rel.get("Id"): _resolve("ppt", rel.get("Target") or "")
        for rel in _relationships(parse_xml(parts[PRESENTATION_RELS]))
    }
    lst = _sldid_list(pres)
    rows = [["#", "Part", "r:id", "Layout", "Title"]]
    position = 0
    for sld in _sldids(lst):
        position += 1
        rid = sld.get(qn("r:id"))
        target = rid_target.get(rid)
        present = target in parts
        rows.append([
            position,
            posixpath.basename(target) if target else "(missing)",
            rid,
            _slide_layout_name(parts, target) if present else "(missing)",
            _title_snippet(parts, target) if present else "",
        ])
    print(f"presentation: {args.input}")
    print(f"slides: {position}")
    print()
    print(format_table(rows))
    return 0


def cmd_reorder(args: argparse.Namespace) -> int:
    refuse_macro_output(args.out)
    refuse_inplace(args.out, args.input)
    parts = read_parts(args.input)
    pres = parse_xml(parts[PRESENTATION])
    lst = _sldid_list(pres)
    sldids = _sldids(lst)
    count = len(sldids)
    order = _parse_positions(args.order, count)
    if sorted(order) != list(range(1, count + 1)):
        raise SlidesError(f"--order must list each of 1-{count} exactly once")
    for sld in sldids:
        lst.remove(sld)
    for pos in order:
        lst.append(sldids[pos - 1])
    parts[PRESENTATION] = serialize(pres)
    return _finish(parts, args, f"reordered {count} slides")


def cmd_delete(args: argparse.Namespace) -> int:
    refuse_macro_output(args.out)
    refuse_inplace(args.out, args.input)
    parts = read_parts(args.input)
    pres = parse_xml(parts[PRESENTATION])
    lst = _sldid_list(pres)
    sldids = _sldids(lst)
    count = len(sldids)
    targets = sorted(set(_parse_positions(args.slides, count)))
    if len(targets) >= count:
        raise SlidesError("refusing to delete every slide")
    for pos in targets:
        lst.remove(sldids[pos - 1])
    parts[PRESENTATION] = serialize(pres)
    removed = clean_orphans(parts)
    remaining = count - len(targets)
    return _finish(
        parts,
        args,
        f"deleted {len(targets)} slide(s); swept {len(removed)} orphaned part(s); {remaining} remain",
    )


def cmd_duplicate(args: argparse.Namespace) -> int:
    refuse_macro_output(args.out)
    refuse_inplace(args.out, args.input)
    parts = read_parts(args.input)
    pres = parse_xml(parts[PRESENTATION])
    lst = _sldid_list(pres)
    sldids = _sldids(lst)
    count = len(sldids)
    if not 1 <= args.slide <= count:
        raise SlidesError(f"--slide {args.slide} out of range 1-{count}")
    dest = args.to if args.to is not None else args.slide + 1
    if not 1 <= dest <= count + 1:
        raise SlidesError(f"--to {dest} out of range 1-{count + 1}")

    rid_rel = {rel.get("Id"): rel for rel in _relationships(parse_xml(parts[PRESENTATION_RELS]))}
    src_rid = sldids[args.slide - 1].get(qn("r:id"))
    src_part = _resolve("ppt", rid_rel[src_rid].get("Target") or "")

    number = _next_slide_number(parts)
    new_part = f"ppt/slides/slide{number}.xml"
    parts[new_part] = parts[src_part]

    # Copy the slide's own rels but drop the notes link, so the copy does not
    # claim the original's notes part; shared layout/media/chart targets are fine.
    src_rels = _rels_name_for(src_part)
    if src_rels in parts:
        rels_root = parse_xml(parts[src_rels])
        for rel in list(_relationships(rels_root)):
            if rel.get("Type") == RT_NOTES_SLIDE:
                rels_root.remove(rel)
        parts[_rels_name_for(new_part)] = serialize(rels_root)

    _add_content_type_override(parts, "/" + new_part)
    rid = _add_slide_presentation_rel(parts, f"slides/slide{number}.xml")
    _insert_sldid(lst, dest, _next_sldid_id(lst), rid)
    parts[PRESENTATION] = serialize(pres)
    return _finish(parts, args, f"duplicated slide {args.slide} as slide{number}.xml at position {dest}")


def cmd_add(args: argparse.Namespace) -> int:
    refuse_macro_output(args.out)
    refuse_inplace(args.out, args.input)
    parts = read_parts(args.input)
    pres = parse_xml(parts[PRESENTATION])
    lst = _sldid_list(pres)
    count = len(_sldids(lst))
    dest = args.to if args.to is not None else count + 1
    if not 1 <= dest <= count + 1:
        raise SlidesError(f"--to {dest} out of range 1-{count + 1}")
    layout_part = _resolve_layout(parts, args.layout)

    number = _next_slide_number(parts)
    new_part = f"ppt/slides/slide{number}.xml"
    parts[new_part] = serialize(parse_xml(EMPTY_SLIDE.encode("utf-8")))

    rels_root = parse_xml(('<Relationships xmlns="%s"/>' % NS["rel"]).encode("utf-8"))
    rels_root.append(
        rels_root.makeelement(
            qn("rel:Relationship"),
            {"Id": "rId1", "Type": RT_SLIDE_LAYOUT, "Target": "../slideLayouts/" + posixpath.basename(layout_part)},
        )
    )
    parts[_rels_name_for(new_part)] = serialize(rels_root)

    _add_content_type_override(parts, "/" + new_part)
    rid = _add_slide_presentation_rel(parts, f"slides/slide{number}.xml")
    _insert_sldid(lst, dest, _next_sldid_id(lst), rid)
    parts[PRESENTATION] = serialize(pres)
    return _finish(
        parts, args, f"added blank slide slide{number}.xml ({posixpath.basename(layout_part)}) at position {dest}"
    )


def cmd_clean(args: argparse.Namespace) -> int:
    refuse_macro_output(args.out)
    refuse_inplace(args.out, args.input)
    parts = read_parts(args.input)
    removed = clean_orphans(parts)
    return _finish(parts, args, f"swept {len(removed)} orphaned part(s)")


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Slide-level structure operations on a .pptx (OPC parts).")
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("info", help="list slides in order with their layout")
    p.add_argument("input", help="path to the .pptx file")
    p.set_defaults(func=cmd_info)

    p = sub.add_parser("reorder", help="rearrange slides into a new order")
    p.add_argument("input", help="path to the .pptx file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--order", required=True, help="permutation of current 1-based positions, e.g. 3,1,2")
    p.set_defaults(func=cmd_reorder)

    p = sub.add_parser("delete", help="remove slides and sweep their orphaned parts")
    p.add_argument("input", help="path to the .pptx file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--slides", required=True, help="1-based positions to delete, e.g. 2,4")
    p.set_defaults(func=cmd_delete)

    p = sub.add_parser("duplicate", help="copy a slide and insert the copy")
    p.add_argument("input", help="path to the .pptx file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--slide", type=int, required=True, help="1-based slide to duplicate")
    p.add_argument("--to", type=int, help="1-based position for the copy (default: right after --slide)")
    p.set_defaults(func=cmd_duplicate)

    p = sub.add_parser("add", help="add a blank slide from a layout")
    p.add_argument("input", help="path to the .pptx file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.add_argument("--layout", required=True, help="layout 1-based index (file order) or name")
    p.add_argument("--to", type=int, help="1-based position for the new slide (default: end)")
    p.set_defaults(func=cmd_add)

    p = sub.add_parser("clean", help="remove orphaned slides/media/notes/charts")
    p.add_argument("input", help="path to the .pptx file")
    p.add_argument("-o", "--out", required=True, help="path to write the result")
    p.set_defaults(func=cmd_clean)

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
