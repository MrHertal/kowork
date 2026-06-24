# Filling flat (non-interactive) PDF forms

Reference detail deferred from `SKILL.md`. Read this before authoring a
`fields.json`. A **flat form** has no AcroForm fields (`forms.py inspect` reports
"no fillable form fields") — it is just printed labels and rule lines. To "fill"
it you stamp text onto the page at the right positions. That is the overlay
workflow, all via `scripts/forms.py` (plus `render.py` to look at the page).

## The loop

1. **Find positions.** `forms.py structure in.pdf -o structure.json` extracts,
   per page, in **PDF points (origin bottom-left)**:
   - `labels` — words with their boxes (`[x0,y0,x1,y1]`);
   - `lines` — horizontal rule lines / underlines (`x0`, `x1`, `y`, `length`);
   - `checkboxes` — small near-square rectangles (`box` + `center`).
     Also render the page and **Read the image** to see the layout:
     `render.py in.pdf prev/ --pages 1`, then Read `prev/page_001.png`.
2. **Author `fields.json`** describing the text to stamp and where (schema below).
3. **Validate the boxes.** `forms.py check-boxes fields.json` flags overlapping
   boxes and boxes too small for their font. Fix and re-run until it prints `OK`.
4. **Stamp.** `forms.py overlay in.pdf fields.json -o out.pdf`.
5. **Verify.** `forms.py preview-boxes in.pdf fields.json prev/` draws each box on
   a render so you can Read it and confirm placement; and/or `render.py out.pdf`
   - Read to see the stamped result. Then `validate.py out.pdf`.

## Coordinate systems

A box may be given in either system; each page declares which one it uses.

- **pdf** — PDF points, origin **bottom-left**, y increases **upward**. This is
  what reportlab/pypdf use and what `structure` emits, so it is natural when you
  take coordinates from `structure` output.
- **image** — pixels, origin **top-left**, y increases **downward**. This is what
  a rendered PNG uses, so it is natural when you measured positions on a render.
  Declare the image's pixel size so overlay can scale to the real page.

`overlay` and `preview-boxes` convert both to PDF points internally (image boxes
are scaled by the real PDF size ÷ the declared image size, and the y axis is
flipped), so placement is identical whichever system you choose.

## `fields.json` schema

```json
{
  "pages": [
    { "page": 1, "pdf_width": 612, "pdf_height": 792 },
    { "page": 2, "image_width": 1275, "image_height": 1650 }
  ],
  "fields": [
    {
      "page": 1,
      "box": [142, 720, 360, 736],
      "text": "Smith",
      "font_size": 11,
      "label": "Last name"
    },
    {
      "page": 2,
      "box": [200, 300, 520, 340],
      "text": "Acme Inc",
      "font_size": 28
    }
  ]
}
```

- Each **`pages`** entry declares that page's system by **which dimension pair it
  carries**: `pdf_width`+`pdf_height` → **pdf**; `image_width`+`image_height` →
  **image**. Declare every page a field references. Declaring both pairs (or
  neither) on one page is an error.
- Each **`fields`** entry: `page` (must be declared), `box` `[x0,y0,x1,y1]` in
  that page's system with `x0<x1` and `y0<y1`, `text` to stamp, `font_size`, and
  an optional `label`/`description`.
- **`font_size` is in the page's units** — points on a pdf page, pixels on an
  image page. `check-boxes` compares box size to `font_size` in those same units,
  and `overlay` converts the font along with the box.

## Worked examples

- **pdf page.** `structure` shows an underline at `y ≈ 718` spanning `x 140–360`.
  Place the answer just above it: `{"page":1,"box":[142,720,360,736],"text":"Smith","font_size":11}`
  on a page declared `{"page":1,"pdf_width":612,"pdf_height":792}`.
- **image page.** You rendered page 1 at 150 DPI (a 1275×1650 image) and measured
  an answer area at pixels `x 200–520`, `y 300–340` (from the top). Declare
  `{"page":1,"image_width":1275,"image_height":1650}` and a field
  `{"page":1,"box":[200,300,520,340],"text":"Acme Inc","font_size":28}` —
  `font_size` here is in pixels.
- **Ticking a checkbox.** Take the box's `center` from `structure` and stamp a
  small `"X"`: give a box a few points wider/taller than the font centered on
  that point, e.g. `{"page":1,"box":[144,658,156,670],"text":"X","font_size":10}`.

## Overlay limitations

- Text is drawn in **Helvetica**, left-aligned, with the baseline vertically
  centred in the box. No other font, weight, or alignment.
- **No wrapping and no auto-shrink** — text longer than the box overflows past
  its right edge. Size boxes and fonts sensibly, and run `check-boxes` first: it
  flags boxes shorter than the font and boxes too narrow for the text (estimated
  at roughly half the font size per character).
- `overlay` stamps text **baked into the page content** (viewer-independent). It
  does not create fillable fields; for a real fillable form, see the interactive
  path in `SKILL.md`.
- `check-boxes` validates geometry (overlap and size), not whether your
  coordinates are where you actually intend — always preview before trusting it.
