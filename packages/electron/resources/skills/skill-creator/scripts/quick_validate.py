#!/usr/bin/env python3
"""Validate the core structure of a Kowork skill without third-party packages."""

from __future__ import annotations

import re
import sys
from pathlib import Path


FRONTMATTER_BOUNDARY = "---"
SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def read_frontmatter(skill_md: Path) -> tuple[dict[str, str], str]:
    content = skill_md.read_text(encoding="utf-8")
    lines = content.splitlines()
    if not lines or lines[0].strip() != FRONTMATTER_BOUNDARY:
        raise ValueError("SKILL.md must start with YAML frontmatter")

    try:
        end = next(
            index
            for index, line in enumerate(lines[1:], start=1)
            if line.strip() == FRONTMATTER_BOUNDARY
        )
    except StopIteration as error:
        raise ValueError("SKILL.md frontmatter is missing its closing ---") from error

    fields: dict[str, str] = {}
    index = 1
    while index < end:
        line = lines[index]
        match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$", line)
        if not match:
            index += 1
            continue

        key, raw_value = match.groups()
        value = (raw_value or "").strip()
        if value in {"|", "|-", "|+", ">", ">-", ">+"}:
            block: list[str] = []
            index += 1
            while index < end and (not lines[index] or lines[index][0].isspace()):
                block.append(lines[index].strip())
                index += 1
            fields[key] = " ".join(part for part in block if part)
            continue

        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        fields[key] = value
        index += 1

    return fields, "\n".join(lines[end + 1 :])


def validate_skill(skill_dir: Path) -> list[str]:
    errors: list[str] = []
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        return ["SKILL.md not found"]

    try:
        fields, _body = read_frontmatter(skill_md)
    except (OSError, UnicodeError, ValueError) as error:
        return [str(error)]

    if "name" not in fields:
        errors.append("frontmatter is missing name")
    elif fields["name"]:
        if not SKILL_NAME.fullmatch(fields["name"]):
            errors.append(
                "name must use lowercase letters or digits separated by single hyphens"
            )
        if fields["name"] != skill_dir.name:
            errors.append(
                f"name must match its folder ({skill_dir.name!r})"
            )
    if "description" not in fields:
        errors.append("frontmatter is missing description")
    return errors


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: quick_validate.py <skill-directory>", file=sys.stderr)
        return 2

    skill_dir = Path(sys.argv[1]).resolve()
    errors = validate_skill(skill_dir)
    if errors:
        for error in errors:
            print(f"error: {error}", file=sys.stderr)
        return 1

    print(f"OK: {skill_dir}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
