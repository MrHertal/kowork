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

    def test_rejects_empty_required_values(self) -> None:
        errors = self.validate(
            "meeting-notes",
            "---\nname:\ndescription: ''\n---\n",
        )
        self.assertIn("frontmatter name must not be empty", errors)
        self.assertIn("frontmatter description must not be empty", errors)


if __name__ == "__main__":
    main()
