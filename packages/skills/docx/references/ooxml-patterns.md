# OOXML patterns for WordprocessingML (.docx)

Reference detail deferred from `SKILL.md`. Everything here is derived from the
public ECMA-376 / ISO-IEC 29500 standard. Read this when an edit needs more than
the happy path.

## Package shape (Open Packaging Conventions)

A `.docx` is a ZIP. The parts that matter:

```
[Content_Types].xml              declares the content type of every part
_rels/.rels                      package root relationships -> main document
word/document.xml                the body of the document
word/_rels/document.xml.rels     relationships used by document.xml (images, comments, ...)
word/styles.xml, numbering.xml   styles and list definitions
word/media/*                     embedded images
word/comments.xml                comments (only if present)
```

Two rules cause most "Word found unreadable content" errors:

1. **Every part needs a content type.** Either a `<Default Extension="..."/>`
   in `[Content_Types].xml`, or a `<Override PartName="/word/..." .../>` for a
   specific part. New named parts (comments, custom XML) almost always need an
   Override.
2. **Cross-part links are relationships.** A part never hard-codes another
   part's path; it references a relationship `Id` defined in the sibling
   `_rels/<part>.rels`. A reference to a missing `Id` (a _dangling_ relationship)
   corrupts the file.

## Document body structure

```
w:document
  w:body
    w:p                  paragraph
      w:pPr              paragraph properties (style, numbering, alignment)
      w:r                run = a span of text with uniform formatting
        w:rPr            run properties (bold, italic, color, ...)
        w:t              the text (use xml:space="preserve" to keep edge spaces)
    w:tbl                table -> w:tr rows -> w:tc cells -> w:p
    w:sectPr             section properties (last child of body: page size, headers)
```

## Runs: splitting and merging

A run is the unit of uniform formatting. Two facts drive most editing logic:

- A single logical sentence is often **several runs** (Word starts a new run at
  every formatting boundary, and sometimes mid-word after spell-check). So a
  phrase you want to match may be split across `w:t` elements. To match or wrap
  it you must either target a substring that lives in one run, or merge adjacent
  runs that share `w:rPr` first.
- To format or annotate part of a run, **split** it: clone the run (copying its
  `w:rPr`) into before / target / after runs, each with its own `w:t`. The
  comment script does exactly this.

## `xml:space="preserve"`

XML collapses insignificant whitespace. If a `w:t` (or `w:delText`) begins or
ends with a space, or is whitespace-only, add `xml:space="preserve"` or the
space is lost on the next save. Easy to forget when splitting runs.

## Special characters and smart quotes

- Escape `&`, `<`, `>` as `&amp;`, `&lt;`, `&gt;` in text (lxml does this for
  you when you set `.text`; only matters if you assemble XML by hand).
- Word stores curly quotes/dashes as literal Unicode characters (U+2018/2019,
  U+201C/201D, U+2013/2014), not entities. Write them directly as UTF-8.
- A line break inside a paragraph is `<w:br/>`; a tab is `<w:tab/>`. A new
  paragraph is a new `w:p`, never `\n` inside a `w:t`.

## Tracked changes (redlines)

Revisions are defined in ECMA-376 Part 1, §17.13. The element shapes below
follow from that schema; the sample wording, authors, and ids are illustrative.

- **Insertion:** wrap the inserted run(s) in
  `<w:ins w:id=".." w:author=".." w:date="..">...</w:ins>`.
- **Deletion:** wrap in `<w:del ...>` and — critically — the deleted text uses
  `<w:delText>` instead of `<w:t>`. A `w:t` inside `w:del` is invalid; Word may
  drop the content. `validate.py --fix` corrects this.
- `w:id` values must be unique across the document. `w:date` is ISO 8601
  (`2026-06-19T00:00:00Z`).

A minimal swap touches only the changed word and leaves the rest in its own
runs. Turning "Delivery is expected in Q3." into "...Q4.":

```xml
<w:r><w:t xml:space="preserve">Delivery is expected in </w:t></w:r>
<w:del w:id="40" w:author="Kowork" w:date="...">
  <w:r><w:delText>Q3</w:delText></w:r>
</w:del>
<w:ins w:id="41" w:author="Kowork" w:date="...">
  <w:r><w:t>Q4</w:t></w:r>
</w:ins>
<w:r><w:t>.</w:t></w:r>
```

**Deleting a whole paragraph / list item:** mark the paragraph mark deleted as
well, or accepting the change leaves an empty paragraph (or empty list item)
behind. Add a `<w:del>` inside the paragraph's `<w:pPr><w:rPr>` (and keep any
`<w:numPr>` so the list item itself is removed):

```xml
<w:p>
  <w:pPr>
    <w:numPr><w:ilvl w:val="0"/><w:numId w:val="3"/></w:numPr>
    <w:rPr><w:del w:id="42" w:author="Kowork" w:date="..."/></w:rPr>
  </w:pPr>
  <w:del w:id="43" w:author="Kowork" w:date="...">
    <w:r><w:delText>This bullet is withdrawn.</w:delText></w:r>
  </w:del>
</w:p>
```

**Rejecting an insertion made by someone else:** nest your `w:del` inside their
`w:ins` — do not remove their `w:ins`:

```xml
<w:ins w:id="50" w:author="Original Author">
  <w:del w:id="51" w:author="Kowork">
    <w:r><w:delText>the wording they added</w:delText></w:r>
  </w:del>
</w:ins>
```

**Restoring something someone else deleted:** leave their `w:del` in place and
add your own `w:ins` after it carrying the text again:

```xml
<w:del w:id="52" w:author="Original Author">
  <w:r><w:delText>the sentence they removed</w:delText></w:r>
</w:del>
<w:ins w:id="53" w:author="Kowork">
  <w:r><w:t>the sentence they removed</w:t></w:r>
</w:ins>
```

These author redlines. _Accepting_ them programmatically needs an Office
engine that Kowork does not bundle.

## Comments

Comments are ECMA-376 Part 1, §17.13.4; the threading parts (`w14:paraId` and
`word/commentsExtended.xml`) are documented Microsoft extensions. A comment is
several coordinated edits (see `comment.py`):

1. In `document.xml`, around the commented range:
   `<w:commentRangeStart w:id="N"/> ...runs... <w:commentRangeEnd w:id="N"/>`
   then a run holding `<w:commentReference w:id="N"/>`.
2. `word/comments.xml`: a `w:comments` root with one `w:comment w:id="N"` per
   comment, each containing block content (`w:p` / `w:r` / `w:t`). The comment's
   `w:p` carries a `w14:paraId` (an 8-hex-digit id) so it can be threaded.
3. `[Content_Types].xml`: an Override for `/word/comments.xml` with type
   `application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml`.
4. `word/_rels/document.xml.rels`: a relationship of type `.../comments` whose
   Target is `comments.xml`.
5. `word/commentsExtended.xml` (+ its own Override and relationship of type
   `http://schemas.microsoft.com/office/2011/relationships/commentsExtended`): a
   `<w15:commentEx w15:paraId=".." w15:done="0"/>` per comment, keyed by that
   comment's `w14:paraId`. A **reply** sets `w15:paraIdParent` to the parent
   comment's `w14:paraId` — that linkage is what threads replies under a parent.

The `w:id` ties the range markers, the reference, and the `w:comment` together;
the `w14:paraId` ties a comment to its `commentsExtended` entry (and replies to
their parent).

## Adding any new part — checklist

1. Write the part bytes (e.g. `word/media/img1.png`).
2. Add its content type (Default by extension, or Override by part name).
3. Add a relationship in the consuming part's `.rels`, get back an `Id`.
4. Reference that `Id` from the consuming XML (e.g. `r:embed="rId7"` on an
   image's `a:blip`).

Skip any step and Word rejects the file.

## Namespace prefixes used here

| Prefix | URI                                                                   |
| ------ | --------------------------------------------------------------------- |
| `w`    | `http://schemas.openxmlformats.org/wordprocessingml/2006/main`        |
| `r`    | `http://schemas.openxmlformats.org/officeDocument/2006/relationships` |
| `ct`   | `http://schemas.openxmlformats.org/package/2006/content-types`        |
| `rel`  | `http://schemas.openxmlformats.org/package/2006/relationships`        |
| `xml`  | `http://www.w3.org/XML/1998/namespace` (carries `xml:space`)          |
