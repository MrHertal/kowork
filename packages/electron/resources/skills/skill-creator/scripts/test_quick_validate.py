#!/usr/bin/env python3
"""Tests for the dependency-free Kowork skill validator."""

from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main

from quick_validate import validate_skill


class QuickValidateTests(TestCase):
    def validate(self, folder: str, content: str) -> list[str]:
        with TemporaryDirectory() as temporary_directory:
            skill_dir = Path(temporary_directory) / folder
            skill_dir.mkdir()
            (skill_dir / "SKILL.md").write_text(content, encoding="utf-8")
            return validate_skill(skill_dir)

    def test_accepts_a_minimal_valid_skill(self) -> None:
        errors = self.validate(
            "meeting-notes",
            "---\nname: meeting-notes\ndescription: Format meeting notes\n---\n",
        )
        self.assertEqual(errors, [])

    def test_accepts_supported_optional_frontmatter(self) -> None:
        errors = self.validate(
            "meeting-notes",
            "---\n"
            "name: meeting-notes\n"
            "description: Format meeting notes\n"
            "license: MIT\n"
            "compatibility: opencode\n"
            "metadata:\n"
            "  audience: managers\n"
            "  workflow: meetings\n"
            "---\n",
        )
        self.assertEqual(errors, [])

    def test_accepts_folded_description(self) -> None:
        errors = self.validate(
            "meeting-notes",
            "---\nname: meeting-notes\ndescription: >-\n"
            "  Format notes and extract\n  decisions and actions\n---\n",
        )
        self.assertEqual(errors, [])

    def test_accepts_yaml_comments_and_single_space_indentation(self) -> None:
        errors = self.validate(
            "meeting-notes",
            "---\n"
            'name: "meeting-notes" # stable identifier\n'
            "description: >-\n Format notes\n"
            "metadata:\n # portable metadata\n audience: managers\n"
            "---\n",
        )
        self.assertEqual(errors, [])

    def test_rejects_invalid_yaml(self) -> None:
        errors = self.validate(
            "meeting-notes",
            '---\nname: meeting-notes\ndescription: "unterminated\n---\n',
        )
        self.assertIn("frontmatter description has an invalid quoted value", errors)

    def test_rejects_unescaped_single_quote(self) -> None:
        errors = self.validate(
            "meeting-notes",
            "---\nname: meeting-notes\ndescription: 'it's reusable'\n---\n",
        )
        self.assertIn("frontmatter description has an invalid quoted value", errors)

    def test_requires_exact_frontmatter_delimiters(self) -> None:
        errors = self.validate(
            "meeting-notes",
            " --- \nname: meeting-notes\ndescription: Format notes\n --- \n",
        )
        self.assertIn("SKILL.md must start with YAML frontmatter", errors)

    def test_rejects_empty_required_values(self) -> None:
        errors = self.validate(
            "meeting-notes",
            "---\nname:\ndescription: ''\n---\n",
        )
        self.assertIn("frontmatter name must not be empty", errors)
        self.assertIn("frontmatter description must not be empty", errors)

    def test_rejects_missing_package_references(self) -> None:
        errors = self.validate(
            "meeting-notes",
            "---\nname: meeting-notes\ndescription: Format notes\n---\n"
            "Run `scripts/format_notes.py` and read "
            "[the rules](references/rules.md).\n",
        )
        self.assertIn(
            "referenced package path does not exist: references/rules.md", errors
        )
        self.assertIn(
            "referenced package path does not exist: scripts/format_notes.py", errors
        )

    def test_rejects_values_over_kowork_limits(self) -> None:
        name = "a" * 65
        errors = self.validate(
            name,
            f"---\nname: {name}\ndescription: {'x' * 1025}\n---\n",
        )
        self.assertIn("name must be no more than 64 characters", errors)
        self.assertIn("description must be no more than 1024 characters", errors)


if __name__ == "__main__":
    main()
