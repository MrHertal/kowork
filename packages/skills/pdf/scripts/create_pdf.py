#!/usr/bin/env python3
"""Authoring template for creating a PDF with reportlab (Platypus).

Copy this into a temp directory (never the user's folder), edit the ``story``
list to build the requested content, then run it to write the PDF to the path
the user wants:

    kowork-python create_pdf.py out.pdf

It runs from a temp directory (never the user's folder); the copy is kept there
after a successful write so you can edit it and re-run to revise the PDF in the
same session (the OS reclaims temp later).

It demonstrates every "create" building block, each editable in one obvious
place: a document title, two heading levels, body paragraphs, a bulleted list, a
numbered list, a styled table (header row + data rows), an inline image, and a
footer with "Page N of M" page numbers. The page size is US Letter (reportlab's
other common default is A4 -- import ``A4`` from reportlab.lib.pagesizes and pass
it as ``pagesize`` instead).

Image note: the tiny PNG below is generated in-memory with Pillow so this file
is self-contained. For a real picture, replace ``demo_image()`` with
``Image("photo.png", width=2 * inch, height=2 * inch)`` pointing at a file.

Usage:
    kowork-python create_pdf.py <out.pdf>
"""

from __future__ import annotations

import argparse
import io
import os
import sys

import reportlab
from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    Image,
    ListFlowable,
    ListItem,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

HEADER_FILL = colors.HexColor("#34507a")
ROW_STRIPE = colors.HexColor("#eef1f6")
BULLET_FONT = "Vera"


class NumberedCanvas(canvas.Canvas):
    """Canvas that stamps "Page N of M" once the total page count is known.

    Platypus draws each page as it is laid out, but the total is only known at
    save() time. So record every page's drawing state as it is finished, then on
    save() replay them and write the footer now that the count is in hand.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_states: list[dict] = []

    def showPage(self) -> None:
        self._saved_states.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._saved_states)
        for state in self._saved_states:
            self.__dict__.update(state)
            self._draw_footer(total)
            super().showPage()
        super().save()

    def _draw_footer(self, total: int) -> None:
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.grey)
        self.drawCentredString(
            self._pagesize[0] / 2.0,
            0.5 * inch,
            f"Page {self._pageNumber} of {total}",
        )


def demo_image() -> Image:
    """A tiny solid-colour PNG built in memory, so the template needs no assets.

    Swap this for ``Image("photo.png", width=..., height=...)`` to embed a real
    image file.
    """
    buf = io.BytesIO()
    PILImage.new("RGB", (96, 96), (52, 80, 122)).save(buf, format="PNG")
    buf.seek(0)
    return Image(buf, width=inch, height=inch, lazy=0)


def register_bullet_font() -> str:
    """Register a bundled TrueType font for the bullet glyph; return its name.

    The built-in Type-1 fonts (Helvetica, ...) are written without a ToUnicode
    map, so a non-ASCII bullet drawn in them extracts as an unmappable "(cid:n)"
    rather than the bullet character. reportlab embeds TrueType fonts with a
    ToUnicode CMap, so a bullet drawn in this font round-trips through text
    extraction. Registering the same name twice is harmless.
    """
    fonts_dir = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
    pdfmetrics.registerFont(TTFont(BULLET_FONT, os.path.join(fonts_dir, "Vera.ttf")))
    return BULLET_FONT


def build_story() -> list:
    """The document content. Edit this list to change what the PDF contains."""
    styles = getSampleStyleSheet()
    body = styles["BodyText"]
    bullet_font = register_bullet_font()

    table_data = [
        ["Item", "Qty", "Price"],
        ["Widget", "3", "$4.00"],
        ["Gadget", "1", "$9.50"],
    ]
    table = Table(table_data, hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, 0), HEADER_FILL),
                ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, ROW_STRIPE]),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
                ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("TOPPADDING", (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]
        )
    )

    return [
        Paragraph("Quarterly Report", styles["Title"]),
        Paragraph("Overview", styles["Heading1"]),
        Paragraph(
            "This document was generated by the Kowork <b>pdf skill</b>. "
            "Edit the story list to change it.",
            body,
        ),
        Paragraph("Highlights", styles["Heading2"]),
        ListFlowable(
            [
                ListItem(Paragraph("First highlight", body)),
                ListItem(Paragraph("Second highlight", body)),
            ],
            bulletType="bullet",
            start="\u2022",
            bulletFontName=bullet_font,
        ),
        Paragraph("Next steps", styles["Heading2"]),
        ListFlowable(
            [
                ListItem(Paragraph("Draft the plan", body)),
                ListItem(Paragraph("Review with the team", body)),
            ],
            bulletType="1",
        ),
        Paragraph("Data", styles["Heading1"]),
        table,
        Spacer(1, 0.3 * inch),
        Paragraph("Figure", styles["Heading1"]),
        demo_image(),
    ]


def build_pdf(out_path: str) -> None:
    doc = SimpleDocTemplate(
        out_path,
        pagesize=LETTER,
        title="Kowork pdf skill demo",
        author="Kowork",
        topMargin=inch,
        bottomMargin=inch,
        leftMargin=inch,
        rightMargin=inch,
    )
    doc.build(build_story(), canvasmaker=NumberedCanvas)


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Create a PDF from an editable reportlab template.")
    ap.add_argument("output", nargs="?", default="output.pdf", help="path to write the .pdf")
    args = ap.parse_args(argv)

    try:
        build_pdf(args.output)
    except Exception as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    size = os.path.getsize(args.output)
    print(f"wrote {args.output} {size} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
