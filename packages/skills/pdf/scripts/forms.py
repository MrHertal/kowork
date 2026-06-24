#!/usr/bin/env python3
"""Fill PDF forms -- interactive (AcroForm) and flat (overlay) -- with pypdf/pdfplumber.

PDFs come in two flavours for form-filling: those with real interactive AcroForm
fields, and "flat" forms that are just labels and lines printed on the page.

Interactive forms (pypdf): ``inspect`` reports what fields exist, ``fields`` dumps
them as JSON, ``fill`` sets them from a values JSON. Button (checkbox/radio) values
are shown without the PDF's internal leading slash and re-added when writing, so
what ``fields`` reports is exactly what ``fill`` accepts (text -> the string to
type; checkbox -> its "on"/"off" value; radio/choice -> one of the listed values).

Flat forms (overlay workflow): ``structure`` extracts a page's labels, rule lines
and candidate tick boxes to help locate where answers go, and ``check-boxes``
validates a hand-authored ``fields.json`` of stamp boxes before the overlay step
stamps them.

Coordinate systems (the crux of the flat-form workflow): two conventions exist.
  * "pdf"   -- PDF points, origin BOTTOM-left, y increases upward (pypdf/reportlab).
  * "image" -- pixels, origin TOP-left, y increases downward (a rendered PNG).
``structure`` always emits the "pdf" convention (it says so in its output). A
``fields.json`` declares its convention per page, so the agent can author boxes in
whichever space it measured.

fields.json schema (consumed by check-boxes now, overlay next)::

    {
      "pages": [
        {"page": 1, "pdf_width": 612, "pdf_height": 792},        # boxes are pdf points, bottom-left
        {"page": 2, "image_width": 1275, "image_height": 1650}   # boxes are pixels, top-left
      ],
      "fields": [
        {"page": 1, "box": [x0, y0, x1, y1], "text": "Smith", "font_size": 11, "label": "Last name"},
        {"page": 2, "box": [x0, y0, x1, y1], "text": "X", "font_size": 28}
      ]
    }

Each page entry declares its convention by which dimension pair it carries
(``pdf_width``+``pdf_height`` => pdf; ``image_width``+``image_height`` => image).
A field's ``box`` is ``[x0, y0, x1, y1]`` in its page's convention with x0<x1 and
y0<y1. ``font_size`` is in the SAME units as that page's boxes (points for pdf
pages, pixels for image pages) -- this keeps the geometry checks system-agnostic.
``label``/``description`` are optional.

Usage:
    kowork-python forms.py inspect <in.pdf>
    kowork-python forms.py fields <in.pdf> [-o fields.json]
    kowork-python forms.py fill <in.pdf> <values.json> -o <out.pdf>
    kowork-python forms.py structure <in.pdf> [-o structure.json] [--pages 1-3,5]
    kowork-python forms.py check-boxes <fields.json>
    kowork-python forms.py overlay <in.pdf> <fields.json> -o <out.pdf>
    kowork-python forms.py preview-boxes <in.pdf> <fields.json> <outdir> [--dpi 150]
"""

from __future__ import annotations

import argparse
import io
import itertools
import json
import os
import sys

import pdfplumber
import pypdfium2 as pdfium
from PIL import ImageDraw
from pypdf import PdfReader, PdfWriter
from reportlab.pdfgen import canvas

from pdfutil import open_reader, parse_page_ranges, refuse_inplace

# Field flag bits (PDF 32000-1 tables 226-228), as 0-based shifts.
FLAG_RADIO = 1 << 15
FLAG_PUSHBUTTON = 1 << 16
FLAG_COMBO = 1 << 17

FILLABLE_TYPES = ("text", "checkbox", "radio", "choice")


class FormsError(Exception):
    """A user-facing failure; main prints it as ``error: ...`` and exits 1."""


def strip_slash(value: object) -> str:
    text = str(value)
    return text[1:] if text.startswith("/") else text


def field_type(ft: object, ff: int) -> str:
    if ft == "/Tx":
        return "text"
    if ft == "/Ch":
        return "choice"
    if ft == "/Btn":
        if ff & FLAG_PUSHBUTTON:
            return "button"
        if ff & FLAG_RADIO:
            return "radio"
        return "checkbox"
    if ft == "/Sig":
        return "signature"
    return "other"


def qualified_name(annot) -> str | None:
    """Fully-qualified field name: join /T up the /Parent chain with dots."""
    parts: list[str] = []
    node = annot
    seen: set[int] = set()
    while node is not None and id(node) not in seen:
        seen.add(id(node))
        partial = node.get("/T")
        if partial is not None:
            parts.insert(0, str(partial))
        parent = node.get("/Parent")
        node = parent.get_object() if parent is not None else None
    return ".".join(parts) if parts else None


def widget_states(annot) -> list[str] | None:
    """The /AP /N keys of a widget (state names for buttons), else None."""
    ap = annot.get("/AP")
    if not ap:
        return None
    normal = ap.get("/N")
    if normal is None:
        return None
    try:
        return [str(k) for k in normal.keys()]
    except Exception:
        return None


def collect_widgets(reader: PdfReader) -> dict[str, list[dict]]:
    """Map field name -> its widget annotations as {page, rect, states}."""
    widgets: dict[str, list[dict]] = {}
    for page_index, page in enumerate(reader.pages):
        for ref in page.get("/Annots") or []:
            annot = ref.get_object()
            if annot.get("/Subtype") != "/Widget":
                continue
            name = qualified_name(annot)
            if name is None:
                continue
            rect = [float(x) for x in annot.get("/Rect", [])] or None
            widgets.setdefault(name, []).append(
                {"page": page_index + 1, "rect": rect, "states": widget_states(annot)}
            )
    return widgets


def checkbox_states(field) -> tuple[str, str]:
    states = [strip_slash(s) for s in (field.get("/_States_") or [])]
    off = "Off" if "Off" in states else (states[0] if states else "Off")
    on = next((s for s in states if s != off), "Yes")
    return on, off


def radio_options(field, wlist: list[dict]) -> list[dict]:
    options = []
    for value in (strip_slash(s) for s in (field.get("/_States_") or [])):
        if value == "Off":
            continue
        page = rect = None
        for widget in wlist:
            on = [strip_slash(s) for s in (widget["states"] or []) if strip_slash(s) != "Off"]
            if value in on:
                page, rect = widget["page"], widget["rect"]
                break
        options.append({"value": value, "page": page, "rect": rect})
    return options


def choice_options(field) -> list[dict]:
    source = field.get("/Opt")
    if source is None:
        source = field.get("/_States_")
    options = []
    for entry in source or []:
        if isinstance(entry, list) and len(entry) == 2:
            value, label = str(entry[0]), str(entry[1])
        else:
            value = label = str(entry)
        options.append({"value": value, "label": label})
    return options


def normalize_value(ftype: str, raw: object) -> object:
    if raw is None:
        return None
    if ftype in ("checkbox", "radio"):
        return strip_slash(raw)
    return str(raw)


def build_records(reader: PdfReader) -> list[dict]:
    fields = reader.get_fields() or {}
    widgets = collect_widgets(reader)
    records = []
    for name, field in fields.items():
        ff = int(field.get("/Ff") or 0)
        ftype = field_type(field.get("/FT"), ff)
        wlist = widgets.get(name, [])
        record = {
            "id": name,
            "type": ftype,
            "page": wlist[0]["page"] if wlist else None,
            "value": normalize_value(ftype, field.get("/V")),
        }
        if ftype == "radio":
            record["options"] = radio_options(field, wlist)
        else:
            record["rect"] = wlist[0]["rect"] if wlist else None
            if ftype == "checkbox":
                record["on"], record["off"] = checkbox_states(field)
            elif ftype == "choice":
                record["combo"] = bool(ff & FLAG_COMBO)
                record["options"] = choice_options(field)
            elif ftype == "text":
                maxlen = field.get("/MaxLen")
                if maxlen is not None:
                    record["max_length"] = int(maxlen)
        records.append(record)
    return records


def coerce_value(field_id: str, record: dict, value: object) -> str:
    """Validate a requested value against the field and return the pypdf form."""
    ftype = record["type"]
    if ftype == "text":
        if isinstance(value, bool) or not isinstance(value, (str, int, float)):
            raise FormsError(f"field {field_id!r} (text) needs a string value, got {value!r}")
        return str(value)
    sval = str(value)
    if ftype == "checkbox":
        allowed = [record["on"], record["off"]]
        if sval not in allowed:
            raise FormsError(f"field {field_id!r} (checkbox) value {value!r} invalid; allowed: {allowed}")
        return f"/{sval}"
    if ftype == "radio":
        allowed = [opt["value"] for opt in record["options"]]
        if sval not in allowed:
            raise FormsError(f"field {field_id!r} (radio) value {value!r} invalid; allowed: {allowed}")
        return f"/{sval}"
    if ftype == "choice":
        allowed = [opt["value"] for opt in record["options"]]
        if sval not in allowed:
            raise FormsError(f"field {field_id!r} (choice) value {value!r} invalid; allowed: {allowed}")
        return sval
    raise FormsError(f"field {field_id!r} is not fillable (type {ftype})")


def cmd_inspect(args: argparse.Namespace) -> int:
    records = build_records(open_reader(args.input, require_pages=False))
    fillable = [r for r in records if r["type"] in FILLABLE_TYPES]
    if not fillable:
        print("no fillable form fields (this is a flat PDF -- use the overlay workflow)")
        return 0
    counts: dict[str, int] = {}
    for record in fillable:
        counts[record["type"]] = counts.get(record["type"], 0) + 1
    print(f"AcroForm with {len(fillable)} fillable field(s):")
    for ftype in FILLABLE_TYPES:
        if counts.get(ftype):
            print(f"  {ftype}: {counts[ftype]}")
    other = sorted({r["type"] for r in records if r["type"] not in FILLABLE_TYPES})
    if other:
        print(f"  (plus non-value widgets: {', '.join(other)})")
    return 0


def cmd_fields(args: argparse.Namespace) -> int:
    records = build_records(open_reader(args.input, require_pages=False))
    fillable = [r for r in records if r["type"] in FILLABLE_TYPES]
    payload = {"fillable": bool(fillable), "field_count": len(fillable), "fields": fillable}
    text = json.dumps(payload, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        print(f"wrote {len(fillable)} field(s) to {args.out}")
    else:
        sys.stdout.write(text + "\n")
    return 0


def cmd_fill(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    reader = open_reader(args.input, require_pages=False)
    records = {r["id"]: r for r in build_records(reader)}
    try:
        with open(args.values, encoding="utf-8") as fh:
            values = json.load(fh)
    except FileNotFoundError:
        raise FormsError(f"no such file: {args.values}")
    except json.JSONDecodeError as exc:
        raise FormsError(f"{args.values} is not valid JSON: {exc}")
    if not isinstance(values, dict):
        raise FormsError("values JSON must be an object mapping field_id -> value")

    # Validate everything before writing anything, so a bad value leaves no output.
    resolved: dict[str, str] = {}
    for field_id, value in values.items():
        record = records.get(field_id)
        if record is None:
            raise FormsError(f"unknown field id: {field_id!r}")
        resolved[field_id] = coerce_value(field_id, record, value)

    writer = PdfWriter()
    writer.append(reader)
    writer.update_page_form_field_values(list(writer.pages), resolved, auto_regenerate=True)
    # NeedAppearances tells viewers to render the new values even if they ignore
    # the generated appearance streams.
    writer.set_need_appearances_writer(True)
    with open(args.out, "wb") as fh:
        writer.write(fh)
    print(f"filled {len(resolved)} field(s) -> {args.out}")
    return 0


# --- flat-form overlay workflow: structure extraction + box validation ---

# A candidate tick box is a small, roughly-square rectangle.
CHECKBOX_MIN_SIDE = 4.0
CHECKBOX_MAX_SIDE = 40.0
CHECKBOX_MIN_ASPECT = 0.6
# Rough average glyph width as a fraction of font size, for the fit estimate.
AVG_CHAR_WIDTH = 0.5


def round2(value: object) -> float:
    return round(float(value), 2)


def top_left_to_pdf_box(x0, x1, top, bottom, height) -> list[float]:
    """Convert a pdfplumber top-left bbox to a PDF bottom-left [x0, y0, x1, y1]."""
    return [round2(x0), round2(height - bottom), round2(x1), round2(height - top)]


def open_plumber(path: str):
    if not os.path.isfile(path):
        raise FormsError(f"no such file: {path}")
    try:
        return pdfplumber.open(path)
    except Exception as exc:
        message = str(exc).lower()
        if "password" in message or "encrypt" in message:
            raise FormsError(f"{path} is encrypted; decrypt it first with 'pages.py decrypt'")
        raise FormsError(f"cannot read {path}: {exc}")


def page_structure(page, page_number: int) -> dict:
    height = float(page.height)
    labels = [
        {"text": w["text"], "box": top_left_to_pdf_box(w["x0"], w["x1"], w["top"], w["bottom"], height)}
        for w in page.extract_words()
    ]
    lines = []
    for ln in page.lines:
        if abs(float(ln["y0"]) - float(ln["y1"])) <= 0.5:  # horizontal rules only
            x0, x1 = sorted((float(ln["x0"]), float(ln["x1"])))
            lines.append({"x0": round2(x0), "x1": round2(x1), "y": round2(ln["y0"]), "length": round2(x1 - x0)})
    checkboxes = []
    for rect in page.rects:
        w_, h_ = float(rect["width"]), float(rect["height"])
        if w_ <= 0 or h_ <= 0:
            continue
        if (CHECKBOX_MIN_SIDE <= min(w_, h_) and max(w_, h_) <= CHECKBOX_MAX_SIDE
                and min(w_, h_) / max(w_, h_) >= CHECKBOX_MIN_ASPECT):
            box = top_left_to_pdf_box(rect["x0"], rect["x1"], rect["top"], rect["bottom"], height)
            center = [round2((box[0] + box[2]) / 2), round2((box[1] + box[3]) / 2)]
            checkboxes.append({"box": box, "center": center})
    return {
        "page": page_number,
        "width": round2(page.width),
        "height": round2(height),
        "labels": labels,
        "lines": lines,
        "checkboxes": checkboxes,
    }


def cmd_structure(args: argparse.Namespace) -> int:
    with open_plumber(args.input) as pdf:
        total = len(pdf.pages)
        indices = parse_page_ranges(args.pages, total) if args.pages else list(range(total))
        pages_out = [page_structure(pdf.pages[idx], idx + 1) for idx in indices]
    payload = {
        "coordinate_system": "pdf",
        "note": "PDF points, origin bottom-left, y increases upward; boxes are [x0,y0,x1,y1] with x0<x1, y0<y1",
        "pages": pages_out,
    }
    text = json.dumps(payload, indent=2)
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        print(f"wrote structure for {len(pages_out)} page(s) to {args.out}")
    else:
        sys.stdout.write(text + "\n")
    return 0


def is_number(value: object) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def parse_fields_doc(path: str) -> tuple[dict[int, dict], list[dict]]:
    """Parse and validate a fields.json into (systems, fields).

    ``systems`` maps page number -> {"system": "pdf"|"image", "width", "height"}
    (declared dimensions in that page's own units). ``fields`` is the validated
    list of field dicts. Raises FormsError on any malformed input, so overlay,
    preview-boxes and check-boxes all reject bad schemas through one code path.
    """
    if not os.path.isfile(path):
        raise FormsError(f"no such file: {path}")
    try:
        with open(path, encoding="utf-8") as fh:
            doc = json.load(fh)
    except json.JSONDecodeError as exc:
        raise FormsError(f"{path} is not valid JSON: {exc}")
    if not isinstance(doc, dict) or not isinstance(doc.get("pages"), list) or not isinstance(doc.get("fields"), list):
        raise FormsError("fields.json must be an object with 'pages' and 'fields' lists")

    systems: dict[int, dict] = {}
    for entry in doc["pages"]:
        if not isinstance(entry, dict) or not is_number(entry.get("page")):
            raise FormsError("each entry in 'pages' needs an integer 'page'")
        number = int(entry["page"])
        has_pdf = is_number(entry.get("pdf_width")) and is_number(entry.get("pdf_height"))
        has_image = is_number(entry.get("image_width")) and is_number(entry.get("image_height"))
        if has_pdf == has_image:
            raise FormsError(
                f"page {number} must declare exactly one of pdf_width/pdf_height or image_width/image_height"
            )
        if number in systems:
            raise FormsError(f"page {number} is declared more than once")
        if has_pdf:
            systems[number] = {"system": "pdf", "width": float(entry["pdf_width"]), "height": float(entry["pdf_height"])}
        else:
            systems[number] = {"system": "image", "width": float(entry["image_width"]), "height": float(entry["image_height"])}

    fields: list[dict] = []
    for index, field in enumerate(doc["fields"]):
        where = f"fields[{index}]"
        if not isinstance(field, dict):
            raise FormsError(f"{where} must be an object")
        if not is_number(field.get("page")):
            raise FormsError(f"{where} needs an integer 'page'")
        page = int(field["page"])
        if page not in systems:
            raise FormsError(f"{where} references page {page}, which is not declared in 'pages'")
        box = field.get("box")
        if not (isinstance(box, list) and len(box) == 4 and all(is_number(v) for v in box)):
            raise FormsError(f"{where} needs a 'box' of four numbers [x0,y0,x1,y1]")
        if not isinstance(field.get("text"), str):
            raise FormsError(f"{where} needs a string 'text'")
        if not (is_number(field.get("font_size")) and field["font_size"] > 0):
            raise FormsError(f"{where} needs a positive 'font_size'")
        fields.append(field)
    return systems, fields


def field_to_pdf(field: dict, sysinfo: dict, pdf_w: float, pdf_h: float) -> tuple[tuple[float, float, float, float], float]:
    """Convert a field's box + font_size from its page's system to PDF points.

    Returns ((x0, y0, x1, y1) bottom-left, font_size_in_points). For an image
    page the pixels are scaled to the actual PDF size and the y axis flipped.
    """
    x0, y0, x1, y1 = (float(v) for v in field["box"])
    font_size = float(field["font_size"])
    if sysinfo["system"] == "pdf":
        left, right = sorted((x0, x1))
        bottom, top = sorted((y0, y1))
        return (left, bottom, right, top), font_size
    sx = pdf_w / sysinfo["width"]
    sy = pdf_h / sysinfo["height"]
    left, right = sorted((x0 * sx, x1 * sx))
    img_top, img_bottom = sorted((y0, y1))  # smaller image-y sits higher on the page
    return (left, pdf_h - img_bottom * sy, right, pdf_h - img_top * sy), font_size * sy



def field_label(field: dict) -> str:
    return field.get("label") or field.get("description") or (field.get("text") or "")[:24] or "?"


def describe_field(field: dict) -> str:
    return f"{field_label(field)!r} box={field['box']}"


def boxes_overlap(a: list, b: list) -> bool:
    ax0, ax1 = sorted((a[0], a[2]))
    ay0, ay1 = sorted((a[1], a[3]))
    bx0, bx1 = sorted((b[0], b[2]))
    by0, by1 = sorted((b[1], b[3]))
    return ax0 < bx1 and bx0 < ax1 and ay0 < by1 and by0 < ay1


def cmd_check_boxes(args: argparse.Namespace) -> int:
    systems, fields = parse_fields_doc(args.fields)

    by_page: dict[int, list[dict]] = {}
    for field in fields:
        by_page.setdefault(int(field["page"]), []).append(field)

    issues: list[str] = []
    for page in sorted(by_page):
        page_fields = by_page[page]
        for field in page_fields:
            x0, y0, x1, y1 = field["box"]
            width, height = abs(x1 - x0), abs(y1 - y0)
            font_size = field["font_size"]
            if height < font_size:
                issues.append(
                    f"page {page}: box too short for its font ({describe_field(field)}): "
                    f"height {round(height, 1)} < font_size {font_size}"
                )
            needed = AVG_CHAR_WIDTH * font_size * len(field["text"])
            if field["text"] and width < needed:
                issues.append(
                    f"page {page}: box too narrow for its text ({describe_field(field)}): "
                    f"width {round(width, 1)} < ~{round(needed, 1)} needed"
                )
        for a, b in itertools.combinations(page_fields, 2):
            if boxes_overlap(a["box"], b["box"]):
                issues.append(f"page {page}: entry boxes overlap: ({describe_field(a)}) and ({describe_field(b)})")

    if issues:
        for message in issues:
            sys.stderr.write(f"issue: {message}\n")
        sys.stderr.write(f"FAILED: {len(issues)} issue(s)\n")
        return 1
    print(f"OK: {len(fields)} field(s) across {len(systems)} page(s), no issues")
    return 0


def open_pdfium(path: str) -> pdfium.PdfDocument:
    if not os.path.isfile(path):
        raise FormsError(f"no such file: {path}")
    try:
        return pdfium.PdfDocument(path)
    except pdfium.PdfiumError as exc:
        if "password" in str(exc).lower():
            raise FormsError(f"{path} is encrypted; decrypt it first with 'pages.py decrypt'")
        raise FormsError(f"cannot open {path}: {exc}")


def group_by_page(fields: list[dict]) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = {}
    for field in fields:
        grouped.setdefault(int(field["page"]), []).append(field)
    return grouped


def build_overlay(pdf_w: float, pdf_h: float, stamps: list[tuple]) -> PdfReader:
    """A one-page overlay (page-sized reportlab canvas) carrying the stamp text."""
    buffer = io.BytesIO()
    pdf_canvas = canvas.Canvas(buffer, pagesize=(pdf_w, pdf_h))
    for (x0, y0, x1, y1), font_size, text in stamps:
        if not text:
            continue
        pdf_canvas.setFont("Helvetica", font_size)
        box_height = y1 - y0
        # Left-pad a little; sit the baseline so the text is vertically centred
        # in the box (or just above its bottom when the box is short).
        baseline = y0 + (max(0.0, box_height - font_size) / 2.0) + font_size * 0.2
        pdf_canvas.drawString(x0 + 2.0, baseline, text)
    pdf_canvas.showPage()
    pdf_canvas.save()
    buffer.seek(0)
    return PdfReader(buffer)


def cmd_overlay(args: argparse.Namespace) -> int:
    refuse_inplace(args.out, args.input)
    reader = open_reader(args.input, require_pages=False)
    systems, fields = parse_fields_doc(args.fields)
    total = len(reader.pages)
    by_page = group_by_page(fields)
    for page in by_page:
        if page < 1 or page > total:
            raise FormsError(f"fields reference page {page}, but the PDF has {total} page(s)")

    writer = PdfWriter()
    writer.append(reader)
    stamped = 0
    for page, page_fields in by_page.items():
        target = writer.pages[page - 1]
        llx, lly, urx, ury = (float(v) for v in target.mediabox)
        pdf_w, pdf_h = urx - llx, ury - lly
        stamps = []
        for field in page_fields:
            pdf_box, font_size = field_to_pdf(field, systems[int(field["page"])], pdf_w, pdf_h)
            stamps.append((pdf_box, font_size, field["text"]))
        overlay = build_overlay(pdf_w, pdf_h, stamps)
        # Translate by the mediabox origin so non-(0,0) pages still line up.
        target.merge_translated_page(overlay.pages[0], llx, lly, over=True)
        stamped += len(page_fields)

    with open(args.out, "wb") as fh:
        writer.write(fh)
    print(f"stamped {stamped} field(s) across {len(by_page)} page(s) -> {args.out}")
    return 0


def cmd_preview_boxes(args: argparse.Namespace) -> int:
    systems, fields = parse_fields_doc(args.fields)
    by_page = group_by_page(fields)
    scale = args.dpi / 72.0
    pdf = open_pdfium(args.input)
    try:
        total = len(pdf)
        for page in by_page:
            if page < 1 or page > total:
                raise FormsError(f"fields reference page {page}, but the PDF has {total} page(s)")
        os.makedirs(args.outdir, exist_ok=True)
        width = max(3, len(str(total)))
        for page, page_fields in by_page.items():
            pdf_page = pdf[page - 1]
            pdf_w, pdf_h = pdf_page.get_size()
            image = pdf_page.render(scale=scale).to_pil().convert("RGB")
            draw = ImageDraw.Draw(image)
            for field in page_fields:
                (x0, y0, x1, y1), _ = field_to_pdf(field, systems[int(field["page"])], pdf_w, pdf_h)
                # PDF points -> preview pixels: x*scale, (pdf_h - y)*scale (y flips).
                ix0, ix1 = x0 * scale, x1 * scale
                iy_top, iy_bottom = (pdf_h - y1) * scale, (pdf_h - y0) * scale
                draw.rectangle([ix0, iy_top, ix1, iy_bottom], outline=(255, 0, 0), width=2)
                draw.text((ix0 + 2, max(0.0, iy_top - 12)), field_label(field), fill=(255, 0, 0))
            image.save(os.path.join(args.outdir, f"page_{page:0{width}d}.png"), "PNG")
    finally:
        pdf.close()
    print(f"wrote {len(by_page)} preview page(s) to {args.outdir}")
    return 0



def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="Fill interactive (AcroForm) PDF forms (pypdf).")
    sub = ap.add_subparsers(dest="command", required=True)

    p = sub.add_parser("inspect", help="report whether the PDF has fillable fields")
    p.add_argument("input", help="path to the .pdf file")
    p.set_defaults(func=cmd_inspect)

    p = sub.add_parser("fields", help="dump fillable fields as JSON")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", help="write JSON here instead of stdout")
    p.set_defaults(func=cmd_fields)

    p = sub.add_parser("fill", help="fill fields from a values JSON")
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("values", help="JSON object mapping field_id -> value")
    p.add_argument("-o", "--out", required=True, help="path to write the filled PDF")
    p.set_defaults(func=cmd_fill)

    p = sub.add_parser(
        "structure",
        help="extract a flat page's labels, lines and tick boxes (pdf coords)",
        description="Extract page geometry (labels, horizontal rule lines, candidate tick "
        "boxes) to locate answer positions on a flat form. Output is PDF points, "
        "origin bottom-left.",
    )
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("-o", "--out", help="write JSON here instead of stdout")
    p.add_argument("--pages", help="pages to analyse, e.g. '1-3,5' (default: all)")
    p.set_defaults(func=cmd_structure)

    p = sub.add_parser("check-boxes", help="validate a fields.json of stamp boxes")
    p.add_argument("fields", help="path to the fields.json to validate")
    p.set_defaults(func=cmd_check_boxes)

    p = sub.add_parser(
        "overlay",
        help="stamp a fields.json's text onto a flat form",
        description="Stamp each field's text into its box, baked into page content "
        "(viewer-independent). Boxes in image coordinates are scaled to the PDF.",
    )
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("fields", help="path to the fields.json describing what to stamp")
    p.add_argument("-o", "--out", required=True, help="path to write the stamped PDF")
    p.set_defaults(func=cmd_overlay)

    p = sub.add_parser(
        "preview-boxes",
        help="render pages with each field's box drawn, to verify placement",
    )
    p.add_argument("input", help="path to the .pdf file")
    p.add_argument("fields", help="path to the fields.json")
    p.add_argument("outdir", help="directory to write preview images into (created if needed)")
    p.add_argument("--dpi", type=float, default=150.0, help="render resolution in DPI (default: 150)")
    p.set_defaults(func=cmd_preview_boxes)

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
