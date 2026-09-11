#!/usr/bin/env python3
"""Validate the canonical Kowork skill format without third-party packages."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


FRONTMATTER_BOUNDARY = "---"
SKILL_NAME = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
PACKAGE_PATH = re.compile(
    r"`((?:scripts|references|assets|tasks|workflows|routing|features|troubleshooting)/[A-Za-z0-9._/-]+)`"
)


NON_STRING_PLAIN_SCALAR = re.compile(
    r"^(?:null|~|true|false|[-+]?(?:\d[\d_]*)(?:\.\d[\d_]*)?(?:e[-+]?\d+)?)$",
    re.IGNORECASE,
)


def _strip_plain_comment(value: str) -> str:
    comment = re.search(r"[ \t]+#", value)
    return value[: comment.start()].rstrip() if comment else value.rstrip()


def _parse_string_scalar(raw_value: str, key: str) -> str:
    value = raw_value.strip()
    if not value:
        return ""

    if value.startswith('"'):
        escaped = False
        closing = None
        for position, character in enumerate(value[1:], start=1):
            if character == '"' and not escaped:
                closing = position
                break
            escaped = character == "\\" and not escaped
            if character != "\\":
                escaped = False
        if closing is None:
            raise ValueError(f"frontmatter {key} has an invalid quoted value")
        suffix = value[closing + 1 :].strip()
        if suffix and not suffix.startswith("#"):
            raise ValueError(f"frontmatter {key} has an invalid quoted value")
        try:
            parsed = json.loads(value[: closing + 1])
        except json.JSONDecodeError as error:
            raise ValueError(f"frontmatter {key} has an invalid quoted value") from error
        if not isinstance(parsed, str):
            raise ValueError(f"frontmatter {key} must be a string")
        return parsed

    if value.startswith("'"):
        output: list[str] = []
        position = 1
        closing = None
        while position < len(value):
            if value[position] != "'":
                output.append(value[position])
                position += 1
                continue
            if position + 1 < len(value) and value[position + 1] == "'":
                output.append("'")
                position += 2
                continue
            closing = position
            break
        if closing is None:
            raise ValueError(f"frontmatter {key} has an invalid quoted value")
        suffix = value[closing + 1 :].strip()
        if suffix and not suffix.startswith("#"):
            raise ValueError(f"frontmatter {key} has an invalid quoted value")
        return "".join(output)

    value = _strip_plain_comment(value)
    if not value:
        return ""
    if value[0] in "[{&*!" or value.startswith(("- ", "? ")):
        raise ValueError(
            f"frontmatter {key} uses unsupported YAML; write it as a string"
        )
    if ": " in value or NON_STRING_PLAIN_SCALAR.fullmatch(value):
        raise ValueError(f"frontmatter {key} must be a string")
    return value


def read_frontmatter(skill_md: Path) -> tuple[dict[str, Any], str]:
    content = skill_md.read_text(encoding="utf-8")
    lines = content.splitlines()
    if not lines or lines[0] != FRONTMATTER_BOUNDARY:
        raise ValueError("SKILL.md must start with YAML frontmatter")

    try:
        end = next(
            index
            for index, line in enumerate(lines[1:], start=1)
            if line == FRONTMATTER_BOUNDARY
        )
    except StopIteration as error:
        raise ValueError("SKILL.md frontmatter is missing its closing ---") from error

    fields: dict[str, Any] = {}
    index = 1
    while index < end:
        line = lines[index]
        if not line.strip() or line.lstrip().startswith("#"):
            index += 1
            continue
        if line[0].isspace():
            raise ValueError(
                f"invalid YAML frontmatter at line {index + 1}: unexpected indentation"
            )
        match = re.match(r"^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$", line)
        if not match:
            raise ValueError(f"invalid YAML frontmatter at line {index + 1}")

        key, raw_value = match.groups()
        if key in fields:
            raise ValueError(f"frontmatter contains duplicate field: {key}")
        value = (raw_value or "").strip()
        if value in {"|", "|-", "|+", ">", ">-", ">+"}:
            block: list[str] = []
            index += 1
            indentation = None
            while index < end and (not lines[index] or lines[index][0].isspace()):
                if "\t" in lines[index][: len(lines[index]) - len(lines[index].lstrip())]:
                    raise ValueError(
                        f"invalid YAML frontmatter at line {index + 1}: "
                        "use spaces to indent block values"
                    )
                if lines[index]:
                    current = len(lines[index]) - len(lines[index].lstrip(" "))
                    indentation = indentation or current
                    if current < indentation:
                        break
                    block.append(lines[index][indentation:])
                else:
                    block.append("")
                index += 1
            separator = "\n" if value.startswith("|") else " "
            fields[key] = separator.join(part for part in block if part)
            continue

        if key == "metadata" and not value:
            metadata: dict[str, str] = {}
            index += 1
            while index < end and (
                not lines[index]
                or lines[index].lstrip().startswith("#")
                or lines[index][0].isspace()
            ):
                if not lines[index] or lines[index].lstrip().startswith("#"):
                    index += 1
                    continue
                nested = re.match(
                    r"^ +([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$", lines[index]
                )
                if not nested:
                    raise ValueError(
                        f"invalid YAML frontmatter at line {index + 1}"
                    )
                metadata_key, metadata_value = nested.groups()
                if metadata_key in metadata:
                    raise ValueError(
                        f"frontmatter metadata contains duplicate field: {metadata_key}"
                    )
                metadata[metadata_key] = _parse_string_scalar(
                    metadata_value or "", f"metadata.{metadata_key}"
                )
                index += 1
            fields[key] = metadata
            continue

        fields[key] = _parse_string_scalar(value, key)
        index += 1

    return fields, "\n".join(lines[end + 1 :])


def validate_skill(skill_dir: Path) -> list[str]:
    errors: list[str] = []
    skill_md = skill_dir / "SKILL.md"
    if not skill_md.is_file():
        return ["SKILL.md not found"]

    try:
        fields, body = read_frontmatter(skill_md)
    except (OSError, UnicodeError, ValueError) as error:
        return [str(error)]

    name = fields.get("name")
    description = fields.get("description")
    if not isinstance(name, str) or not name.strip():
        errors.append("frontmatter name must not be empty")
    else:
        if not SKILL_NAME.fullmatch(name):
            errors.append(
                "name must use lowercase letters or digits separated by single hyphens"
            )
        if name != skill_dir.name:
            errors.append(
                f"name must match its folder ({skill_dir.name!r})"
            )
        if len(name) > 64:
            errors.append("name must be no more than 64 characters")
    if not isinstance(description, str) or not description.strip():
        errors.append("frontmatter description must not be empty")
    elif len(description) > 1024:
        errors.append("description must be no more than 1024 characters")

    referenced_paths = set(PACKAGE_PATH.findall(body))
    for target in MARKDOWN_LINK.findall(body):
        path_text = target.split("#", 1)[0].strip()
        if not path_text or "://" in path_text or path_text.startswith(("#", "/")):
            continue
        referenced_paths.add(path_text)

    for relative_path in sorted(referenced_paths):
        if not (skill_dir / relative_path).exists():
            errors.append(f"referenced package path does not exist: {relative_path}")
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
