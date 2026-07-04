// Authoring template for creating a .pptx with pptxgenjs (the `pptxgenjs` npm
// package, pre-bundled in Kowork and resolvable via NODE_PATH). Copy this into a
// temp directory (never the user's folder), edit the copy, and run it, writing
// the deck to the path the user wants:
//
//     kowork-node create_pptx.cjs out.pptx
//
// It runs from a temp directory (never the user's folder); the copy is kept
// there after a successful write so you can edit it and re-run to revise the
// deck in the same session (the OS reclaims temp later). Use the .cjs extension
// so `require` works even when the surrounding project is an ES module
// ("type": "module" in package.json). This file is intentionally standalone: it
// does NOT import the skill's Python helpers (pptxutil.py); pptxgenjs is the only
// dependency.
//
// Slide size: pptxgenjs ships four layouts; pick one and the whole deck scales to
// it. Dimensions are width x height in inches:
//     LAYOUT_16x9   10    x 5.625   (16:9)
//     LAYOUT_16x10  10    x 6.25    (16:10)
//     LAYOUT_4x3    10    x 7.5     (4:3, legacy)
//     LAYOUT_WIDE   13.333 x 7.5    (16:9, PowerPoint's modern default)
// This template defines its own widescreen layout from SLIDE_W/SLIDE_H below so
// the slide size is a single edit point; change those two numbers to rescale.
//
// Design lives in the COLOR / FONT / SIZE constants at the top: edit them once to
// restyle every slide. Each slide section further down is one obvious edit point.
//
// pptxgenjs gotchas this file is written to respect:
//   - Hex colors are 6 digits WITHOUT a leading "#". A "#" or an 8-digit hex can
//     corrupt the file; for alpha use the `transparency`/`opacity` options.
//   - Bullets come from `bullet: true` (with `indentLevel` for sub-bullets), never
//     a literal "•" glyph. Separate lines in one text box need `breakLine: true`.
//   - pptxgenjs converts option values to EMU IN PLACE, mutating the object you
//     pass. Never share one options object across two calls; build a fresh object
//     each time (the small factory/helper functions below exist for exactly this).
//   - Shadow `offset` must be non-negative.
//
// Image note: the tiny inline PNG below keeps this file self-contained. For a real
// image, read the bytes with fs.readFileSync("photo.png") and pass them as a data
// URL: { data: "image/png;base64," + buf.toString("base64") } (or { path: "..." }).
// pptxgenjs sizes images by width/height in INCHES and does not preserve aspect
// ratio for you: read the pixel size first and derive one dimension from the other
// so it isn't stretched. The bundled runtime has `image-size`
// (require("image-size")) for Node, and Pillow for Python
// (kowork-python -c "from PIL import Image; print(Image.open('photo.png').size)").

const fs = require("fs");
const path = require("path");
const pptxgen = require("pptxgenjs");

const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFklEQVR42mNQTX5NEmIY1TCqYfhqAAB2SXMQ7LkbdQAAAABJRU5ErkJggg==";

// --- Design system ---------------------------------------------------------
// A dominant color, two supporting tones, one warm accent, plus neutrals.
const COLOR = {
  primary: "1F3B57", // dominant deep slate-blue: dark backgrounds, headers, bars
  secondary: "3E6B96", // supporting mid blue: second data series, secondary fills
  tint: "9FB7CE", // supporting light blue: subtitles and accents on dark
  accent: "E0A33E", // warm amber: highlights, callout numbers, key emphasis
  ink: "1B2733", // near-black: body text on light slides
  muted: "63748A", // slate gray: captions and secondary text
  surface: "EEF2F7", // very light blue-gray: cards and table row banding
  white: "FFFFFF",
};

// Serif display paired with a humanist sans for body; swap in one place.
const FONT = { head: "Georgia", body: "Calibri" };

// Point-size scale.
const SIZE = {
  title: 40, // title-slide headline
  section: 28, // per-slide titles
  subtitle: 20, // title-slide subtitle, lead-in lines
  body: 16, // paragraphs, bullets, table cells
  caption: 11, // footers, sources, image captions
  stat: 54, // the big number in a stat callout
};

const SLIDE_W = 13.333;
const SLIDE_H = 7.5;
const MARGIN = 0.6;
const CONTENT_W = SLIDE_W - 2 * MARGIN;

// --- Reusable builders (each returns/uses a fresh options object) ----------

// Full-bleed background rectangle. A factory, not a shared constant, because the
// title and closing slides both use it and pptxgenjs would mutate a shared object.
function bgFill(color) {
  return {
    x: 0,
    y: 0,
    w: SLIDE_W,
    h: SLIDE_H,
    fill: { color },
    line: { type: "none" },
  };
}

// Accent tick + heading used at the top of every content slide.
function addSectionTitle(slide, text) {
  slide.addShape("rect", {
    x: MARGIN,
    y: 0.62,
    w: 0.28,
    h: 0.52,
    fill: { color: COLOR.accent },
    line: { type: "none" },
  });
  slide.addText(text, {
    x: MARGIN + 0.45,
    y: 0.5,
    w: CONTENT_W - 0.45,
    h: 0.8,
    fontFace: FONT.head,
    fontSize: SIZE.section,
    bold: true,
    color: COLOR.ink,
    valign: "middle",
  });
}

// Thin footer rule + label for polish on content slides.
function addFooter(slide, label) {
  slide.addShape("rect", {
    x: MARGIN,
    y: SLIDE_H - 0.66,
    w: CONTENT_W,
    h: 0.012,
    fill: { color: COLOR.surface },
    line: { type: "none" },
  });
  slide.addText(label, {
    x: MARGIN,
    y: SLIDE_H - 0.62,
    w: CONTENT_W,
    h: 0.3,
    fontFace: FONT.body,
    fontSize: SIZE.caption,
    color: COLOR.muted,
    align: "left",
    valign: "middle",
  });
}

function headerCell(text) {
  return {
    text,
    options: {
      bold: true,
      color: COLOR.white,
      fill: { color: COLOR.primary },
      fontFace: FONT.body,
      fontSize: SIZE.body,
      align: "left",
      valign: "middle",
    },
  };
}

function bodyCell(text, rowIndex, align) {
  return {
    text,
    options: {
      color: COLOR.ink,
      fill: { color: rowIndex % 2 === 0 ? COLOR.surface : COLOR.white },
      fontFace: FONT.body,
      fontSize: SIZE.body,
      align: align || "left",
      valign: "middle",
    },
  };
}

// --- Deck ------------------------------------------------------------------

const outPath = process.argv[2] || "presentation.pptx";

const outExt = path.extname(outPath).toLowerCase();
if (outExt === ".pptm" || outExt === ".potm" || outExt === ".ppsm") {
  console.error(
    `error: refusing to write a macro-enabled presentation (${outExt}); macros are ` +
      "never authored here. Write a .pptx instead.",
  );
  process.exit(1);
}

const pptx = new pptxgen();
pptx.defineLayout({ name: "KOWORK_WIDE", width: SLIDE_W, height: SLIDE_H });
pptx.layout = "KOWORK_WIDE";
pptx.author = "Kowork";
pptx.title = "Kowork pptx skill demo";

// 1. Title slide ------------------------------------------------------------
const title = pptx.addSlide();
title.addShape("rect", bgFill(COLOR.primary));
title.addShape("rect", {
  x: MARGIN,
  y: 4.05,
  w: 2.4,
  h: 0.08,
  fill: { color: COLOR.accent },
  line: { type: "none" },
});
// Optional icon motif: an accent disc with a single glyph. Keep it simple.
title.addShape("ellipse", {
  x: MARGIN,
  y: 1.55,
  w: 1.0,
  h: 1.0,
  fill: { color: COLOR.accent },
  line: { type: "none" },
});
title.addText("K", {
  x: MARGIN,
  y: 1.55,
  w: 1.0,
  h: 1.0,
  align: "center",
  valign: "middle",
  fontFace: FONT.head,
  fontSize: 34,
  bold: true,
  color: COLOR.primary,
});
title.addText("Quarterly Business Review", {
  x: MARGIN,
  y: 2.9,
  w: SLIDE_W - 2 * MARGIN,
  h: 1.2,
  fontFace: FONT.head,
  fontSize: SIZE.title,
  bold: true,
  color: COLOR.white,
});
title.addText("Results, momentum, and the road ahead", {
  x: MARGIN,
  y: 4.25,
  w: SLIDE_W - 2 * MARGIN,
  h: 0.6,
  fontFace: FONT.body,
  fontSize: SIZE.subtitle,
  color: COLOR.tint,
});
title.addText("Kowork  ·  FY24", {
  x: MARGIN,
  y: SLIDE_H - 0.9,
  w: SLIDE_W - 2 * MARGIN,
  h: 0.4,
  fontFace: FONT.body,
  fontSize: SIZE.caption,
  color: COLOR.tint,
});

// 2. Agenda slide (real bullets, with sub-bullets) --------------------------
const agenda = pptx.addSlide();
addSectionTitle(agenda, "Agenda");
agenda.addText(
  [
    { text: "Where we are", options: { bullet: true, breakLine: true } },
    {
      text: "Quarter highlights and key metrics",
      options: {
        bullet: true,
        indentLevel: 1,
        color: COLOR.muted,
        breakLine: true,
      },
    },
    {
      text: "What the numbers say",
      options: { bullet: true, breakLine: true },
    },
    {
      text: "Revenue by segment and trend",
      options: {
        bullet: true,
        indentLevel: 1,
        color: COLOR.muted,
        breakLine: true,
      },
    },
    { text: "Where we're going", options: { bullet: true, breakLine: true } },
    {
      text: "Themes for next quarter",
      options: {
        bullet: true,
        indentLevel: 1,
        color: COLOR.muted,
        breakLine: true,
      },
    },
    {
      text: "What we need from you",
      options: { bullet: true, breakLine: true },
    },
  ],
  {
    x: MARGIN + 0.3,
    y: 1.9,
    w: CONTENT_W - 0.3,
    h: 4.6,
    fontFace: FONT.body,
    fontSize: SIZE.subtitle,
    color: COLOR.ink,
    lineSpacingMultiple: 1.35,
    valign: "top",
  },
);
addFooter(agenda, "Kowork  ·  Quarterly Business Review");

// 3. Content slide: paragraph + a stat callout (not text-only) --------------
const overview = pptx.addSlide();
addSectionTitle(overview, "Overview");
// Multi-run paragraph: bold mid-sentence emphasis, then breakLine to a new line.
overview.addText(
  [
    { text: "Kowork turns a short brief into a polished deck. ", options: {} },
    { text: "Edit one file", options: { bold: true } },
    {
      text: " and re-run to regenerate the whole presentation.",
      options: { breakLine: true },
    },
    {
      text: "Every block on the following slides is a single, obvious edit point.",
      options: { color: COLOR.muted },
    },
  ],
  {
    x: MARGIN,
    y: 2.0,
    w: 7.7,
    h: 3.4,
    fontFace: FONT.body,
    fontSize: SIZE.body,
    color: COLOR.ink,
    lineSpacingMultiple: 1.3,
    valign: "top",
  },
);
// Stat callout card. Shadow offset is non-negative, as pptxgenjs requires.
overview.addShape("roundRect", {
  x: 8.9,
  y: 1.9,
  w: 3.8,
  h: 3.4,
  rectRadius: 0.12,
  fill: { color: COLOR.surface },
  line: { type: "none" },
  shadow: {
    type: "outer",
    blur: 8,
    offset: 3,
    angle: 90,
    color: COLOR.primary,
    opacity: 0.25,
  },
});
overview.addText("37%", {
  x: 8.9,
  y: 2.2,
  w: 3.8,
  h: 1.6,
  align: "center",
  valign: "middle",
  fontFace: FONT.head,
  fontSize: SIZE.stat,
  bold: true,
  color: COLOR.accent,
});
overview.addText("faster from brief to first draft", {
  x: 9.1,
  y: 3.8,
  w: 3.4,
  h: 1.2,
  align: "center",
  valign: "top",
  fontFace: FONT.body,
  fontSize: SIZE.body,
  color: COLOR.muted,
});
overview.addNotes(
  "Speaker notes: open on the time saved, then frame the next slides as the proof. " +
    "Edit the COLOR and FONT constants at the top of the file to restyle the whole deck.",
);
addFooter(overview, "Kowork  ·  Quarterly Business Review");

// 4. Styled table -----------------------------------------------------------
const tableSlide = pptx.addSlide();
addSectionTitle(tableSlide, "Revenue by Segment");
const rows = [
  [
    headerCell("Segment"),
    headerCell("FY23"),
    headerCell("FY24"),
    headerCell("Change"),
  ],
  [
    bodyCell("Enterprise", 0),
    bodyCell("$4.2M", 0, "right"),
    bodyCell("$5.1M", 0, "right"),
    bodyCell("+21%", 0, "right"),
  ],
  [
    bodyCell("Mid-market", 1),
    bodyCell("$2.8M", 1, "right"),
    bodyCell("$3.3M", 1, "right"),
    bodyCell("+18%", 1, "right"),
  ],
  [
    bodyCell("SMB", 2),
    bodyCell("$1.1M", 2, "right"),
    bodyCell("$1.5M", 2, "right"),
    bodyCell("+36%", 2, "right"),
  ],
];
tableSlide.addTable(rows, {
  x: MARGIN,
  y: 1.9,
  w: CONTENT_W,
  colW: [5.333, 2.2, 2.2, 2.2],
  rowH: [0.6, 0.55, 0.55, 0.55],
  border: { type: "solid", pt: 1, color: COLOR.white },
  valign: "middle",
});
addFooter(tableSlide, "Kowork  ·  Quarterly Business Review");

// 5. Column chart (palette series colors, clean axes) -----------------------
const chartSlide = pptx.addSlide();
addSectionTitle(chartSlide, "Quarterly Trend");
chartSlide.addChart(
  pptx.ChartType.bar,
  [
    {
      name: "FY23",
      labels: ["Q1", "Q2", "Q3", "Q4"],
      values: [3.1, 3.4, 3.8, 4.0],
    },
    {
      name: "FY24",
      labels: ["Q1", "Q2", "Q3", "Q4"],
      values: [3.6, 4.2, 4.7, 5.1],
    },
  ],
  {
    x: MARGIN,
    y: 1.9,
    w: CONTENT_W,
    h: 4.6,
    barDir: "col", // "col" = vertical columns; "bar" = horizontal bars
    barGapWidthPct: 45,
    chartColors: [COLOR.secondary, COLOR.primary],
    showLegend: true,
    legendPos: "b",
    legendColor: COLOR.muted,
    legendFontFace: FONT.body,
    legendFontSize: SIZE.caption,
    showTitle: false,
    showValue: false,
    catAxisLabelColor: COLOR.ink,
    catAxisLabelFontFace: FONT.body,
    catAxisLabelFontSize: SIZE.caption,
    catAxisLineColor: COLOR.muted,
    valAxisLabelColor: COLOR.muted,
    valAxisLabelFontFace: FONT.body,
    valAxisLabelFontSize: SIZE.caption,
    valAxisLineShow: false,
    valGridLine: { color: COLOR.surface, style: "solid", size: 1 },
    catGridLine: { style: "none" },
  },
);
addFooter(chartSlide, "Kowork  ·  Quarterly Business Review");

// 6. Embedded image ---------------------------------------------------------
const imageSlide = pptx.addSlide();
addSectionTitle(imageSlide, "Visual");
imageSlide.addImage({
  data: "image/png;base64," + PNG_BASE64,
  x: MARGIN,
  y: 2.0,
  w: 3.2,
  h: 3.2,
});
imageSlide.addText(
  [
    { text: "Drop in a real image", options: { bold: true, breakLine: true } },
    {
      text:
        'Replace PNG_BASE64 with fs.readFileSync("photo.png"), then size it by ' +
        "reading the pixel dimensions and keeping the aspect ratio so it is not stretched.",
      options: { color: COLOR.muted },
    },
  ],
  {
    x: 4.2,
    y: 2.0,
    w: SLIDE_W - 4.2 - MARGIN,
    h: 3.2,
    fontFace: FONT.body,
    fontSize: SIZE.body,
    color: COLOR.ink,
    lineSpacingMultiple: 1.3,
    valign: "top",
  },
);
imageSlide.addText(
  "Placeholder image — swap for a chart export, photo, or logo.",
  {
    x: MARGIN,
    y: 5.3,
    w: 3.2,
    h: 0.5,
    align: "center",
    fontFace: FONT.body,
    fontSize: SIZE.caption,
    italic: true,
    color: COLOR.muted,
  },
);
addFooter(imageSlide, "Kowork  ·  Quarterly Business Review");

// 7. Closing slide ----------------------------------------------------------
const closing = pptx.addSlide();
closing.addShape("rect", bgFill(COLOR.primary));
closing.addShape("rect", {
  x: MARGIN,
  y: 4.1,
  w: 2.4,
  h: 0.08,
  fill: { color: COLOR.accent },
  line: { type: "none" },
});
closing.addText("Thank you", {
  x: MARGIN,
  y: 2.9,
  w: SLIDE_W - 2 * MARGIN,
  h: 1.2,
  fontFace: FONT.head,
  fontSize: SIZE.title,
  bold: true,
  color: COLOR.white,
});
closing.addText("Questions and discussion  ·  hello@example.com", {
  x: MARGIN,
  y: 4.3,
  w: SLIDE_W - 2 * MARGIN,
  h: 0.6,
  fontFace: FONT.body,
  fontSize: SIZE.subtitle,
  color: COLOR.tint,
});
closing.addNotes(
  "Speaker notes: invite questions; leave contact details on screen.",
);

// --- Write ----------------------------------------------------------------

pptx
  .writeFile({ fileName: outPath })
  .then((fileName) => {
    const bytes = fs.statSync(fileName).size;
    console.log("wrote", fileName, bytes, "bytes");
  })
  .catch((err) => {
    console.error("error:", err.message);
    process.exit(1);
  });
