# Building a deck with pptxgenjs (.pptx)

Reference detail deferred from `SKILL.md`. The create path builds a deck with
**pptxgenjs**, run under `kowork-node`; this is the companion to
`scripts/create_pptx.cjs`. Part A is the API you actually need. Part B is how to
keep the result from looking generic. Confirm the output with `validate.py`, and
— since nothing here renders — open it in PowerPoint or Keynote for true visual
QA.

## A. pptxgenjs essentials

### Setup

```js
const pptxgen = require("pptxgenjs");
const pptx = new pptxgen(); // one fresh instance per file
pptx.defineLayout({ name: "WIDE", width: 13.333, height: 7.5 });
pptx.layout = "WIDE"; // or a built-in (below)
pptx.author = "Kowork";
pptx.title = "Quarterly Review";
const slide = pptx.addSlide();
// ...build slides...
pptx
  .writeFile({ fileName: outPath }) // returns a Promise
  .then((f) => console.log("wrote", f))
  .catch((e) => {
    console.error("error:", e.message);
    process.exit(1);
  });
```

Built-in layouts (width × height, inches): `LAYOUT_16x9` 10×5.625, `LAYOUT_16x10`
10×6.25, `LAYOUT_4x3` 10×7.5, `LAYOUT_WIDE` 13.333×7.5 (the modern 16:9 default).
`defineLayout` makes the slide size a single edit point.

### Correctness facts (the ones that silently corrupt a file)

- **Hex is 6 digits, no `#`.** `color: "1F3B57"` ✓ — `"#1F3B57"` and 8-digit
  `"1F3B57CC"` ✗. For transparency use the `transparency`/`opacity` options
  (0–100), never an alpha hex.
- **Bullets are `bullet: true`**, never a typed `"•"` glyph.
- **One text box, many lines:** put `breakLine: true` on the run that ends a line.
- **A fresh options object per call.** pptxgenjs rewrites option values to EMU
  _in place_, so reusing one object across two calls corrupts the second. Use a
  factory:

  ```js
  const fullBleed = (color) => ({
    x: 0,
    y: 0,
    w: "100%",
    h: "100%",
    fill: { color },
    line: { type: "none" },
  });
  slide.addShape("rect", fullBleed("1F3B57")); // each call gets its own object
  ```

- **Shadow `offset` is non-negative.** One `new pptxgen()` per output file.

### Text — plain, rich runs, bullets

```js
slide.addText("A single line", {
  x: 0.6,
  y: 0.5,
  w: 6,
  h: 1,
  fontFace: "Calibri",
  fontSize: 18,
  color: "1B2733",
  align: "left",
  valign: "middle",
});

// Rich text: an array of runs; mixed formatting; breakLine starts a new line.
slide.addText(
  [
    { text: "Revenue rose ", options: {} },
    { text: "37%", options: { bold: true, color: "E0A33E" } },
    { text: " this quarter.", options: { breakLine: true } },
    { text: "Driven by enterprise.", options: { color: "63748A" } },
  ],
  {
    x: 0.6,
    y: 1.8,
    w: 7.7,
    h: 2,
    fontFace: "Calibri",
    fontSize: 16,
    color: "1B2733",
    lineSpacingMultiple: 1.3,
  },
);

// Bullets: true, sub-levels via indentLevel, numbered via bullet:{type:"number"}.
slide.addText(
  [
    { text: "Top point", options: { bullet: true, breakLine: true } },
    {
      text: "Sub point",
      options: { bullet: true, indentLevel: 1, breakLine: true },
    },
    {
      text: "Step one",
      options: { bullet: { type: "number" }, breakLine: true },
    },
  ],
  { x: 0.9, y: 1.9, w: 11, h: 4, fontFace: "Calibri", fontSize: 18 },
);
```

### Shapes

```js
slide.addShape("rect", {
  x: 0,
  y: 0,
  w: "100%",
  h: "100%",
  fill: { color: "EEF2F7" },
});
slide.addShape("roundRect", {
  x: 1,
  y: 1,
  w: 3.8,
  h: 2,
  rectRadius: 0.12,
  fill: { color: "3E6B96", transparency: 20 },
  line: { type: "none" },
  shadow: {
    type: "outer",
    blur: 8,
    offset: 3,
    angle: 90,
    color: "1F3B57",
    opacity: 0.25,
  },
});
slide.addShape("ellipse", {
  x: 5,
  y: 1,
  w: 1,
  h: 1,
  fill: { color: "E0A33E" },
});
slide.addShape("line", {
  x: 1,
  y: 4,
  w: 6,
  h: 0,
  line: { color: "63748A", width: 2, dashType: "dash" },
});
```

A simple icon motif is a filled `ellipse` with a centered one-glyph `addText` on
top (see the template's title slide).

### Image

pptxgenjs places images by width/height in **inches** and does not preserve aspect
ratio on its own. Either let it fit a box, or compute one dimension:

```js
// From a file (or base64 data: "image/png;base64," + buf.toString("base64")).
slide.addImage({ path: "photo.png", x: 0.6, y: 2, w: 3.2, h: 2.4 });

// Fit inside a box without distortion:
slide.addImage({
  path: "logo.png",
  x: 0.6,
  y: 2,
  w: 3,
  h: 2,
  sizing: { type: "contain", w: 3, h: 2 },
});

// Or keep the ratio yourself by reading the pixel size first:
const { width, height } = require("image-size")(
  require("fs").readFileSync("photo.png"),
);
const w = 4,
  h = w * (height / width);
slide.addImage({ path: "photo.png", x: 0.6, y: 2, w, h });
```

(Pillow via `kowork-python -c "from PIL import Image; print(Image.open('photo.png').size)"`
gives the pixel size too.)

### Background, table, chart, notes

```js
slide.background = { color: "1F3B57" }; // or { path } / { data }

slide.addTable(
  [
    [
      {
        text: "Segment",
        options: { bold: true, color: "FFFFFF", fill: { color: "1F3B57" } },
      },
      {
        text: "FY24",
        options: {
          bold: true,
          color: "FFFFFF",
          fill: { color: "1F3B57" },
          align: "right",
        },
      },
    ],
    [
      { text: "Enterprise", options: { fill: { color: "EEF2F7" } } },
      { text: "$5.1M", options: { align: "right" } },
    ],
  ],
  {
    x: 0.6,
    y: 1.9,
    w: 8,
    colW: [5, 3],
    border: { type: "solid", pt: 1, color: "FFFFFF" },
    valign: "middle",
  },
);

slide.addChart(
  pptx.ChartType.bar,
  [
    // bar (barDir:"col" = columns), line, pie, doughnut, area
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
    x: 0.6,
    y: 1.9,
    w: 12,
    h: 4.6,
    barDir: "col",
    chartColors: ["3E6B96", "1F3B57"],
    showLegend: true,
    legendPos: "b",
    showTitle: false,
    catAxisLabelColor: "1B2733",
    valAxisLineShow: false,
    valGridLine: { color: "EEF2F7", style: "solid", size: 1 },
    catGridLine: { style: "none" },
  },
);

slide.addNotes("Speaker notes for this slide.");
```

Series colors come from `chartColors` (palette hexes); keep axes quiet (faint
gridline, no heavy axis lines) so the data leads.

### Slide masters (optional)

For repeated branding, define a master once and stamp slides from it:
`pptx.defineSlideMaster({ title: "BRAND", background: { color: "1F3B57" }, objects: [...] })`,
then `pptx.addSlide({ masterName: "BRAND" })`. For a short deck, the
factory-helper approach in the template (a shared `addSectionTitle`/`addFooter`)
is simpler.

### Icons without a rasteriser

This skill bundles no SVG→PNG converter (no `sharp`, no `react-icons` pipeline),
so use one of:

1. **Native shapes** — draw the motif with pptxgenjs (a filled `ellipse` plus a
   glyph, a small `rect` accent). Always works; the template does this.
2. **Embed an SVG** — `addImage({ path: "icon.svg", ... })` renders in Microsoft
   365 / current PowerPoint / Keynote. Legacy PowerPoint may not show it, so a PNG
   is the universal fallback.
3. **Bring a PNG** — size it from its pixel dimensions (above) so it isn't
   stretched.

## B. Design conventions

The template's `COLOR` / `FONT` / `SIZE` constants are the worked example; edit
them in one place to restyle every slide. Aim for a deck that looks deliberate,
not defaulted.

### Palette discipline

Pick a **topic-fit** palette, not reflexive blue-on-white. One **dominant** color
carries most of the weight (backgrounds, headers, primary bars), **one or two
supporting tones** sit near it, and a **single accent** marks the few things that
matter (a key number, one bar, a divider). The template's set:

```
primary 1F3B57  dominant deep slate-blue   secondary 3E6B96  supporting mid blue
tint    9FB7CE  light blue on dark         accent    E0A33E  warm amber (sparingly)
ink 1B2733  body text   muted 63748A  captions   surface EEF2F7  cards/banding
```

Use the accent on ~5–10% of a slide; if everything is accented, nothing is.

### Typographic hierarchy

Pair a **display** font for headings with a readable **body** font, and commit to
a small size scale so every slide ranks information the same way. The template
uses `FONT = { head: "Georgia", body: "Calibri" }` and:

```
title 40   section 28   subtitle 20   body 16   caption 11   stat 54 (callout number)
```

Bold the titles, section headers, and inline labels; keep body text regular weight.

### Layout variety

Don't ship title+bullets seven times. Rotate through layout shapes — a section
divider, a two-column split, a stat callout card, an image-with-text, a table, a
chart — and give **every slide a visual element** (a rule, a colored shape, a
chart, an image), even if small. A wall of bullets reads as a draft.

### Spacing and margins

Use a consistent margin (the template keeps ~0.6") and even gaps between blocks;
align edges to an invisible grid. Keep content off the slide edges — `validate.py`
flags anything within 0.25" of an edge as a tight margin. The deliberate exception
is a **full-bleed background**, which is meant to run to the edges.

### Common mistakes to avoid

- Low contrast (mid-gray text on a tinted fill; pale text on white).
- Centered body paragraphs — center titles if you like, left-align prose.
- Inconsistent spacing and stray alignments from slide to slide.
- Text-only slides with no visual anchor.
- Styling the first slide well and leaving the rest on defaults — restyle via the
  shared constants so the whole deck moves together.
- Cramming: when a slide is full, split it rather than shrinking the body font.

### After building

Run `validate.py deck.pptx` for the structure + layout check (off-slide shapes,
collisions, leftover placeholder text), fix what it flags, then open the file in a
real viewer — there is no renderer here, so a human (or PowerPoint/Keynote) is the
last word on how it looks.
