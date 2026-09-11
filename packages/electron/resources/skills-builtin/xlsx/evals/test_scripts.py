"""CLI regressions: kowork-python -B -m unittest discover -s evals -p 'test_*.py'."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile
import unittest

from openpyxl import Workbook, load_workbook

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"


class SheetPositionsTest(unittest.TestCase):
    def run_script(self, script, *args, success=True):
        result = subprocess.run(
            [sys.executable, "-B", str(SCRIPTS / f"{script}.py"), *map(str, args)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        return result

    def test_one_based_insertion_and_movement_preserve_active_sheet(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.xlsx"
            wb = Workbook()
            wb.active.title = "Original"
            wb.create_sheet("Last")
            wb.save(source)
            wb.close()

            for command, options, expected in (
                ("add", ["--name", "New", "--index", "1"], ["New", "Original", "Last"]),
                ("add", ["--name", "New", "--index", "3"], ["Original", "Last", "New"]),
                ("move", ["--sheet", "2", "--to-index", "1"], ["Last", "Original"]),
                ("move", ["--sheet", "1", "--to-index", "2"], ["Last", "Original"]),
                ("add", ["--name", "New", "--index", "0"], None),
                ("move", ["--sheet", "1", "--to-index", "0"], None),
                ("add", ["--name", "New", "--index", "4"], None),
                ("move", ["--sheet", "1", "--to-index", "3"], None),
            ):
                with self.subTest(command=command, options=options):
                    output = root / "output.xlsx"
                    output.unlink(missing_ok=True)
                    result = subprocess.run(
                        [sys.executable, "-B", str(SCRIPTS / "sheets.py"), command,
                         str(source), "-o", str(output), *options],
                        capture_output=True, text=True,
                    )
                    self.assertEqual(result.returncode, 0 if expected else 1, result.stderr)
                    if expected:
                        actual = load_workbook(output)
                        self.assertEqual(actual.sheetnames, expected)
                        self.assertEqual(actual.active.title, "Original")
                        actual.close()
                    else:
                        self.assertFalse(output.exists())

    def test_edit_refuses_hard_link_alias(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "source.xlsx"
            alias = root / "alias.xlsx"
            wb = Workbook()
            wb.save(source)
            wb.close()
            os.link(source, alias)
            original = source.read_bytes()
            result = self.run_script(
                "edit_xlsx",
                "set",
                source,
                "-o",
                alias,
                "--sheet",
                "Sheet",
                "--cell",
                "A1",
                "changed",
                success=False,
            )
            self.assertIn("error:", result.stderr)
            self.assertEqual(source.read_bytes(), original)

    def test_create_requires_xlsx_extension(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "book.xlsx.tmp"
            result = self.run_script("create_xlsx", output, success=False)
            self.assertIn(".xlsx extension", result.stderr)
            self.assertFalse(output.exists())
