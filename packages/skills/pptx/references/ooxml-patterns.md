# OOXML patterns for PresentationML (.pptx)

Reference detail deferred from `SKILL.md`. Everything here is derived from the
public ECMA-376 / ISO-IEC 29500 standard. Read this when a slide-content edit
needs more than the happy path.

## Edit workflow

Hand-editing changes the _content_ of a slide. Work in a temp dir, never the
user's folder:

1. `unpack.py deck.pptx work/` — explodes the package and pretty-prints the XML
   so a slide is line-editable.
2. Edit `work/ppt/slides/slideN.xml` (the slide number is its position-ish part
   name, not its 1-based order — confirm with `slides.py info`).
3. `pack.py work/ out.pptx` — rebuilds the package.
4. `validate.py out.pptx` — confirm it reopens and the layout is sound; re-edit
   and repack if it reports problems. Pass `pack.py ... --cleanup` once validated
   to drop the temp tree.

Adding, duplicating, deleting, reordering, or cleaning up **whole slides** is
`slides.py`'s job — it rewires `presentation.xml`, the rels, and
`[Content_Types].xml` for you. Don't hand-wire those for a whole slide.

## Package shape (Open Packaging Conventions)

A `.pptx` is a ZIP. The parts that matter:

```
[Content_Types].xml                 declares the content type of every part
_rels/.rels                         package root relationships -> presentation
ppt/presentation.xml                slide order (p:sldIdLst), slide size
ppt/_rels/presentation.xml.rels     links presentation.xml -> each slide, master, ...
ppt/slides/slideN.xml               one slide's content
ppt/slides/_rels/slideN.xml.rels    that slide's links (layout, images, charts, notes)
ppt/slideLayouts/, ppt/slideMasters/   inherited placeholders, theme mapping
ppt/notesSlides/, ppt/theme/, ppt/media/   speaker notes, theme, embedded images
```

Two rules cause most "PowerPoint found a problem with content" repairs:

1. **Every part needs a content type.** Either a `<Default Extension="..."/>` in
   `[Content_Types].xml`, or an `<Override PartName="/ppt/..." .../>` for a
   specific part. A new named part (a slide, a chart) needs an Override.
2. **Cross-part links are relationships.** A part never hard-codes another
   part's path; it references a relationship `Id` defined in the sibling
   `_rels/<part>.rels`. A reference to a missing `Id` (a _dangling_ relationship)
   corrupts the file.

## Slide content structure

```
p:sld
  p:cSld
    p:spTree
      p:sp                shape (e.g. a text box)
        p:nvSpPr          non-visual props (p:cNvPr id/name)
        p:spPr            shape props -> a:xfrm geometry, a:prstGeom, fill
        p:txBody          text body
          a:bodyPr        body props (wrap, anchor)
          a:p             paragraph (one per logical line / list item)
            a:pPr         paragraph props (algn, marL/indent, bullet)
            a:r           run = a span of uniform formatting
              a:rPr       run props (b, i, sz, a:solidFill)
              a:t         the text
      p:pic               picture -> p:blipFill > a:blip r:embed="rIdN"
      p:graphicFrame      a table (a:tbl: a:tr rows, a:tc cells) or a chart
```

A text box, as PowerPoint emits it:

```xml
<p:sp>
  <p:spPr>
    <a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm>
  </p:spPr>
  <p:txBody>
    <a:bodyPr wrap="square" anchor="ctr"/>
    <a:p>
      <a:pPr algn="ctr"/>
      <a:r>
        <a:rPr lang="en-US" sz="2800" b="1">
          <a:solidFill><a:srgbClr val="1B2733"/></a:solidFill>
        </a:rPr>
        <a:t>Quarterly Review</a:t>
      </a:r>
    </a:p>
  </p:txBody>
</p:sp>
```

Run properties: `b="1"` bold, `i="1"` italic, `sz` is **hundredths of a point**
(`sz="2800"` = 28 pt), colour is `a:solidFill > a:srgbClr val="RRGGBB"` (6 hex
digits, no `#`). Tables and pictures are pointers above — edit their text/`a:t`
the same way; re-target an image by changing the `r:embed` Id (see the checklist).

## Geometry

A shape's position and size live in `p:spPr > a:xfrm`:

```xml
<a:xfrm><a:off x="457200" y="274638"/><a:ext cx="8229600" cy="1143000"/></a:xfrm>
```

`a:off` is the top-left corner, `a:ext` the width/height, all in **EMU**:
**914400 EMU = 1 inch, 12700 EMU = 1 point**. This is exactly what `validate.py`'s
layout linter reads to flag off-slide or colliding shapes.

## Editing patterns and gotchas

- **Bold headers and labels.** Put `b="1"` on the run's `a:rPr` for slide and
  section titles, and for inline labels that introduce a value.
- **One `a:p` per logical line or list item.** Never concatenate several items
  into one paragraph's text. To add an item, copy a sibling `a:p` whole — keeping
  its `a:pPr` — and change the `a:t`, so spacing and bullet formatting carry over.
- **Bullets.** Prefer letting a paragraph inherit its bullet from the layout (add
  no bullet property). To override, the marker lives literally in the XML here —
  unlike the create path, where a glyph is never typed:
  - a custom glyph: `<a:buChar char="•"/>` inside `a:pPr`;
  - numbering: `<a:buAutoNum type="arabicPeriod"/>`;
  - no bullet: `<a:buNone/>`.

  A hanging indent pairs `marL` with a negative `indent`, e.g.
  `<a:pPr marL="342900" indent="-342900"><a:buChar char="•"/></a:pPr>`.

- **Whitespace.** XML collapses insignificant whitespace. If an `a:t` begins or
  ends with a space, or is whitespace-only, add `xml:space="preserve"` or the
  space is lost on the next save: `<a:t xml:space="preserve"> and </a:t>`.
- **Special characters and smart quotes.** `unpack.py` does not transform text,
  and an editor may silently turn typographic quotes into ASCII. Escape markup
  characters, and write typographic punctuation as the literal UTF-8 character or
  as an XML numeric entity:

  | Character        | Entity                |     | Character        | Entity     |
  | ---------------- | --------------------- | --- | ---------------- | ---------- |
  | `&` `<` `>`      | `&amp;` `&lt;` `&gt;` |     | en dash `–`      | `&#x2013;` |
  | left single `'`  | `&#x2018;`            |     | em dash `—`      | `&#x2014;` |
  | right single `'` | `&#x2019;`            |     | left double `"`  | `&#x201C;` |
  | apostrophe `'`   | `&#x2019;`            |     | right double `"` | `&#x201D;` |

- **Line break vs. paragraph.** A soft break within a paragraph is `<a:br/>`. A
  new paragraph is a new `a:p`. Never put a `\n` inside an `a:t`.

## Slide order and structure

Order is the sequence of `<p:sldId>` children under `<p:sldIdLst>` in
`ppt/presentation.xml`; each points through a relationship `Id` to a slide part.
Reordering, deleting, duplicating, adding, and orphan-cleanup all touch that list
plus the rels and content types in lockstep — use `slides.py`, not hand edits.

## Adding any new part — checklist

1. Write the part bytes (e.g. `ppt/media/image2.png`).
2. Add its content type — a `Default` by extension (images usually already have
   one), or an `Override` by part name for a named XML part.
3. Add a relationship in the consuming part's `.rels`, get back an `Id`.
4. Reference that `Id` from the consuming XML (e.g. `r:embed="rId3"` on the
   picture's `a:blip`).

Skip any step and PowerPoint rejects the file.

## Namespace prefixes used here

| Prefix | URI                                                                   |
| ------ | --------------------------------------------------------------------- |
| `p`    | `http://schemas.openxmlformats.org/presentationml/2006/main`          |
| `a`    | `http://schemas.openxmlformats.org/drawingml/2006/main`               |
| `r`    | `http://schemas.openxmlformats.org/officeDocument/2006/relationships` |
| `ct`   | `http://schemas.openxmlformats.org/package/2006/content-types`        |
| `rel`  | `http://schemas.openxmlformats.org/package/2006/relationships`        |
| `xml`  | `http://www.w3.org/XML/1998/namespace` (carries `xml:space`)          |
