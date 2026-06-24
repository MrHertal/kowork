#!/usr/bin/env python3
"""Repack a directory of OOXML parts back into a .pptx package.

The inverse of ``unpack.py``. Walks the working directory, stores every file at
its relative path using forward slashes (OPC requires them) with deflate
compression. ``[Content_Types].xml`` must be present, so this refuses to build a
package without it -- its absence is the most common cause of a package that
opens to an error. Editor junk such as .DS_Store is skipped. A macro-enabled
output extension is refused: this skill reads macros but never authors them.

Pass --cleanup to delete the working directory after a successful pack, so no
unpacked XML is left beside the user's deck. As a safety net it only deletes a
directory that lives under a temp dir (where the edit flow should unpack); a work
dir anywhere else is left in place with a note.

Usage:
    kowork-python pack.py <source_dir> <output.pptx> [--cleanup]
"""

from __future__ import annotations

import argparse
import os
import shutil
import sys
import tempfile
import zipfile

from pptxutil import PptxError, refuse_macro_output

SKIP_NAMES = {".DS_Store", "Thumbs.db"}


def iter_files(root: str):
    for dirpath, _dirs, files in os.walk(root):
        for name in files:
            if name in SKIP_NAMES:
                continue
            full = os.path.join(dirpath, name)
            arc = os.path.relpath(full, root).replace(os.sep, "/")
            yield full, arc


def within_temp(path: str) -> bool:
    """True if ``path`` resolves to somewhere under a recognized temp root."""
    real = os.path.realpath(path)
    roots = [
        tempfile.gettempdir(),
        os.environ.get("TMPDIR"),
        os.environ.get("TEMP"),
        os.environ.get("TMP"),
        "/tmp",
        "/private/tmp",
        "/var/tmp",
    ]
    for root in roots:
        if not root:
            continue
        rr = os.path.realpath(root)
        if real == rr or real.startswith(rr + os.sep):
            return True
    return False


def main(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description="Pack an unpacked OOXML tree into a .pptx.")
    ap.add_argument("source_dir", help="the unpacked working directory")
    ap.add_argument("output", help="path to write the .pptx")
    ap.add_argument("--cleanup", action="store_true", help="remove source_dir after a successful pack (temp dirs only)")
    args = ap.parse_args(argv)

    src_dir, out_path = args.source_dir, args.output

    try:
        refuse_macro_output(out_path)
    except PptxError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1

    if not os.path.isdir(src_dir):
        sys.stderr.write(f"error: {src_dir} is not a directory\n")
        return 1
    if not os.path.isfile(os.path.join(src_dir, "[Content_Types].xml")):
        sys.stderr.write("error: [Content_Types].xml missing; not a valid OOXML working tree\n")
        return 1

    count = 0
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for full, arc in iter_files(src_dir):
            zf.write(full, arc)
            count += 1

    print(f"packed {count} parts into {out_path}")

    if args.cleanup:
        if within_temp(src_dir):
            shutil.rmtree(src_dir, ignore_errors=True)
            print(f"removed work dir {src_dir}")
        else:
            print(f"left work dir {src_dir} (not under a temp dir); remove it yourself")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
