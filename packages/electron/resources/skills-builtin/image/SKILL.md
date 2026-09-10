---
name: kowork-image
description: >-
  Create, convert, resize, crop, rotate, watermark, caption, combine, inspect,
  adjust, animate, and validate raster images. Use whenever the user wants to
  make an image from scratch (a banner, thumbnail, or social card); change an
  image's format or compress it; strip metadata; resize, crop, rotate, or flip;
  brighten, saturate, blur, sharpen, or grayscale; add a watermark, logo, or
  caption; build a collage or side-by-side; create or extract an animated GIF;
  or answer questions about an image's format, dimensions, or metadata.
  Triggers on any mention of an image, photo, picture, logo, watermark,
  thumbnail, banner, or screenshot, or a
  .png/.jpg/.jpeg/.webp/.gif/.bmp/.tiff/.tif/.ico/.avif file, even without the
  word "image". Images embedded in Office documents or PDFs are handled by
  those skills, not this one.
---

# Working with image files

A raster image is a grid of pixels — a photo, a logo, a screenshot. Every
operation in this skill runs through **Pillow** (Python): fixed scripts for the
standard jobs, plus an editable template for authoring an image from scratch.
Most files hold a single still frame; animated GIFs hold several frames and
follow the **GIF** path. Pick the path that matches the request, then follow it.

## User-facing communication

Follow this procedure silently. Unless the user asks or needs the information to
make a decision, do not mention loading this Skill, templates, scripts, tools,
temporary directories, commands, or validation mechanics. For routine work,
give at most one brief progress update in user-facing terms. By default, the
final response should state the outcome first, identify any delivered file, and
summarize only useful results without an unsolicited offer or follow-up question.

After final validation succeeds for any create or edit, including an
in-place-style re-encode, call `present_files` exactly once with every final
user-facing output path. Never call it for read-only or summarization work, and
never pass temporary files, scripts, previews, validation artifacts, or
intermediate versions. If validation or `present_files` fails, do not claim the
image is ready.

## Runtime (obey exactly)

- Run Python as **`kowork-python`** (Kowork puts it on `PATH`; it launches the
  embedded interpreter and works in any shell) — never bare `python`/`python3`.
  **Pillow is the only image library**: import nothing else (no numpy, opencv,
  or scipy), and use no system tools — ImageMagick, ffmpeg, sips, and exiftool
  are not available and must not be used.
- The scripts below live in this skill's `scripts/` directory; paths are
  relative to it. On failure they print `error: ...` to stderr and exit
  non-zero; non-fatal notes go to stderr prefixed `note: ...`.
- No script overwrites its input: passing the same path for input and output is
  an error. Always write to a new path.

## Seeing images (critical rule)

The shell returns text only, so writing or editing an image file does **not**
put it in context. To actually _see_ an image you must **Read the file with the
Read tool** (needs a vision-capable model). After any create or edit where
appearance matters, Read the output image as visual QA before handing it back.

## Choose the path

| Request                                                          | Path          |
| ---------------------------------------------------------------- | ------------- |
| Make a new image from scratch (banner, thumbnail, social card)   | **Create**    |
| What is this file / dimensions / metadata / does it have alpha?  | **Inspect**   |
| Change format, compress, strip metadata                          | **Convert**   |
| Resize, crop, rotate, flip                                       | **Transform** |
| Brighten, saturate, blur, sharpen, grayscale                     | **Adjust**    |
| Add a watermark, logo, or caption                                | **Annotate**  |
| Collage, grid, side-by-side                                      | **Combine**   |
| Make an animated GIF, or pull its frames out                     | **GIF**       |
| Confirm an image is sound                                        | **Validate**  |

## Create (Pillow template)

Creating an image means editing and running a short Pillow script — there is no
one-flag CLI for "from scratch". Create a **uniquely named task directory with
a random suffix inside the exact pre-approved temporary directory shown in the
Bash tool instructions — never in the user's folder**. Copy that pre-approved
path in full, exactly as shown — never shorten or reconstruct it. Use that task
directory (`<task-temp-dir>`) for every working file. Do not work directly in
the pre-approved directory, derive another path from environment variables, or
create a sibling directory.

1. Copy `scripts/create_image.py` into that task directory and edit the
   copy's `build_image()` to build the requested image.
2. Run the copy, writing to the path the user asked for:

   ```sh
   kowork-python <task-temp-dir>/create_image.py "/path/the/user/wants/out.png"
   ```

3. Validate the result (see Validate). If it fails, fix and re-run; do not hand
   back an unvalidated file. Where appearance matters, also Read the output as
   visual QA.
4. Keep that working copy in the task directory for the rest of the task: to
   revise an image you generated this session, re-edit this script and re-run it
   rather than rebuilding from scratch. The task directory is never beside the
   user's file, and the OS reclaims it later.

The template is self-contained (Pillow + standard library only — no `imgutil`
import) and renders a demo card showing every building block: canvas size
(`WIDTH`/`HEIGHT`), a vertical-gradient background, a translucent
rounded-rectangle card, accent shapes, a title and subtitle in the scalable
default font, and an alpha-masked badge. Swap the badge for a real picture with
`Image.open("photo.png")` + `resize()` + `paste()`. `ImageDraw` does not
alpha-blend, so translucent shapes and text go on a clear overlay merged with
`Image.alpha_composite` — the template comments demonstrate this. The output
format comes from the extension; JPEG/BMP have no alpha channel and flatten
onto white.

## Inspect (info.py)

```sh
kowork-python scripts/info.py in.png
kowork-python scripts/info.py in.png --json      # one JSON object, for machine-readable use
```

Reports format, byte size, dimensions, color mode and whether it has alpha,
frame count (plus frame duration and loop count for animations), DPI, and the
printable EXIF tags — including the Orientation tag that makes phone photos
display sideways. GPS EXIF is reported as present/absent, never as coordinates.
Run it before any edit; `info.py` shows the raw stored geometry, while the
mutating paths below bake EXIF orientation into the pixels first.

## Convert (re-encode)

```sh
kowork-python scripts/convert.py in.png out.jpg --quality 85
kowork-python scripts/convert.py in.jpg out.webp --quality 80
kowork-python scripts/convert.py in.png out.jpg --strip-metadata --background '#EEEEEE'
```

The output extension picks the format; pixels are decoded and re-encoded,
nothing else changes.

- `--quality` (1–100) applies only to JPEG, WebP, and AVIF. Re-encoding a JPEG
  is lossy — pass `--quality` when fidelity or file size matters.
- EXIF orientation is **not** applied — the tag travels with the metadata, so
  viewers keep displaying the picture the same way up.
- Metadata is carried over where the output format supports it (EXIF:
  JPEG/PNG/WebP/TIFF; ICC: JPEG/PNG/TIFF/WebP; DPI: JPEG/PNG);
  `--strip-metadata` drops all three. EXIF is preserved or dropped, never
  edited.
- Formats without an alpha channel (JPEG, BMP) flatten transparent pixels onto
  `--background` (default white).
- An animated input converts to its first frame only, with a `note:` on stderr.

## Transform (resize / crop / rotate / flip)

```sh
kowork-python scripts/transform.py resize in.png out.png --max 1600x1600
kowork-python scripts/transform.py resize in.png out.png --width 800
kowork-python scripts/transform.py resize in.png out.png --percent 50
kowork-python scripts/transform.py resize in.png out.png --size 800x600
kowork-python scripts/transform.py crop in.png out.png --box 10,10,300,180
kowork-python scripts/transform.py rotate in.png out.png --degrees 90
kowork-python scripts/transform.py rotate in.png out.png --degrees -15 --expand
kowork-python scripts/transform.py flip in.png out.png --horizontal   # or --vertical
```

- EXIF orientation is baked into the pixels before transforming, so the
  geometry matches what viewers show; the output is then re-encoded with
  **fresh metadata** — input EXIF and ICC are dropped (the stale Orientation
  tag cannot survive: its rotation is now the pixels').
- The resize flags are mutually exclusive. `--max` fits inside the box
  preserving the aspect ratio and never upscales; `--size`, `--width`,
  `--height`, and `--percent` do upscale. `--size` is exact and may change the
  aspect ratio (a `note:` warns). All resizing uses LANCZOS.
- Crop boxes are pixel coordinates with the origin at the **top-left**
  (`--box L,T,R,B`) — unlike the pdf skill's bottom-left points. A box
  overhanging the edge is clamped with a `note:`; fully outside is an error.
  Negative coordinates need the `=` form, `--box=-50,-50,100,100` — argparse
  reads a bare leading `-` as a flag.
- `rotate --degrees` is counter-clockwise; multiples of 90 are exact. Without
  `--expand` the canvas keeps its size and the corners are cropped; `--expand`
  grows the canvas to fit. New area fills white (opaque image) or transparent
  (alpha image).
- An animated input transforms as its first frame only.

## Adjust (brightness / contrast / color / sharpness / filters)

```sh
kowork-python scripts/adjust.py in.png out.png --brightness 1.1 --contrast 1.2
kowork-python scripts/adjust.py in.png out.png --grayscale
kowork-python scripts/adjust.py in.png out.png --blur 2
```

Factors are floats where **1.0 = no change** (0.5 halves, 2.0 doubles);
negatives are rejected and at least one flag is required. Enhancements run in a
fixed order — brightness → contrast → color (saturation) → sharpness — and the
mutually exclusive filter (`--blur R` Gaussian radius, `--sharpen`,
`--grayscale`) runs last, so results are reproducible regardless of flag order.
EXIF orientation is baked in and the output gets fresh metadata, as in
Transform; an alpha channel is set aside before the math and re-attached after,
so translucent pixels keep their exact opacity. An animated input adjusts as
its first frame only.

## Annotate (watermark / text)

```sh
kowork-python scripts/annotate.py watermark in.png out.png --mark logo.png
kowork-python scripts/annotate.py watermark in.png out.png --mark logo.png --position top-left --opacity 0.6 --scale 0.15
kowork-python scripts/annotate.py watermark in.png out.png --mark logo.png --tile --opacity 0.2
kowork-python scripts/annotate.py text in.png out.png --text "© 2026 Acme"
kowork-python scripts/annotate.py text in.png out.png --text "SALE" --font /path/font.ttf --size 64 --color '#FF0000'
```

- Positions are named only: `center`, `top-left`, `top-right`, `bottom-left`,
  `bottom-right` (default `bottom-right`), inset ~2% of the smaller dimension.
  `--tile` repeats the mark in a grid across the whole image and ignores
  `--position`.
- `watermark --mark` takes a logo image (PNG with transparency works best).
  `--scale` is the mark's width as a fraction of the image width (default
  0.25); `--opacity` multiplies the mark's alpha (default 1.0).
- `text --text` draws a label (a newline draws multiple lines). The default
  font is Pillow's embedded scalable sans at 4% of the smaller dimension (min
  12 px); brand fonts need `--font /path/font.ttf` and `--size N`. `--color`
  takes `#RRGGBB[AA]` or a named color (default white).
- Compositing happens on an RGBA copy, so semi-transparent marks and text blend
  correctly; saving to JPEG/BMP flattens onto white. EXIF orientation is baked
  in; the output gets fresh metadata. An animated input annotates as its first
  frame only.

## Combine (grid / row / column)

```sh
kowork-python scripts/combine.py out.png a.png b.png c.png d.png --grid 2x2 --gap 8
kowork-python scripts/combine.py out.png a.png b.png --hstack --gap 16
kowork-python scripts/combine.py out.png a.png b.png --vstack
kowork-python scripts/combine.py out.png a.png b.png --hstack --background '#00000000'
```

- Inputs are **never rescaled**: every cell is as large as the widest and
  tallest input, each image centered in its cell, with padding filled by
  `--background` (default white). For uniform cells, resize the inputs first
  with `transform.py`.
- `--grid CxR` is **columns × rows**, filled row-major; more cells than inputs
  leaves trailing cells as background, fewer cells than inputs is an error.
  At least 2 inputs are required.
- The canvas is RGBA, so `--background '#00000000'` leaves transparent gaps
  when the output is PNG (JPEG/BMP flatten onto white). EXIF orientation is
  baked in; the output gets fresh metadata.

## Animated GIF (create / extract)

```sh
kowork-python scripts/gif.py create out.gif frame1.png frame2.png frame3.png --duration 200 --loop 0
kowork-python scripts/gif.py extract in.gif frames/
```

- `create` takes 2+ frames in play order; the output must be a `.gif`.
  `--duration` is per-frame milliseconds (default 100); `--loop` is how many
  times to loop, 0 = forever (default 0). Frames of differing sizes are resized
  (LANCZOS) to the **first** frame's size, with a `note:` — a GIF has a single
  canvas size.
- GIF transparency is 1-bit (ragged edges), so frame alpha is flattened onto
  white. Use the PNG-based paths when transparency matters.
- Pillow merges identical consecutive frames, so the output may hold fewer
  frames than you passed (their durations add up). Verify an animation by its
  duration and by Reading the extracted frames — never by frame count.
- `extract` writes every frame as `frame_001.png`-style names into the output
  directory (created if needed); each PNG is the full composited picture even
  when the GIF stores per-frame diffs. A single-frame input is refused — it is
  not an animation.
- Every other path treats an animated image as its first frame only;
  `gif.py extract` is the exception.

## Validate (always, after creating or editing)

```sh
kowork-python scripts/validate.py out.png
```

Re-opens the file with Pillow and fully decodes every frame — which catches the
real failure modes (truncated downloads, corrupt pixel data, an unreadable
format). Prints `OK: ...` with format, size, and frame count, or fails with
`error: ...` and `FAILED: decode check`. It is a soundness smoke test, **not**
a content or pixel checker — Read the output for visual QA. Run it on the final
image before handing it back.

## Limitations (state plainly to the user)

- **No SVG (vector).** Vector files can be neither read nor written.
- **No AI image work.** No generation, background removal, inpainting, or
  upscaling beyond resampling.
- **No OCR.** Text inside a picture cannot be extracted.
- **No RAW camera formats** (.cr2, .nef, .dng, ...).
- **Color profiles pass through unchanged** — convert.py preserves the ICC
  profile, but nothing converts between color spaces.
- **Animated WebP is not supported** (animated GIF is).
- **EXIF is reported and preserved (by convert.py) but cannot be edited.**
- **JPEG re-encoding is lossy** — pass `--quality` when fidelity matters.
- **ICO output is capped at 256×256 px.**
