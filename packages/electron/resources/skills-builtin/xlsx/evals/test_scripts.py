"""CLI regressions: kowork-python -B -m unittest discover -s evals -p 'test_*.py'."""
from pathlib import Path
import importlib.util
import os
import subprocess
import sys
import tempfile
import unittest

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font

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
                ("add", ["--name", "New", "--to", "1"], ["New", "Original", "Last"]),
                ("add", ["--name", "New", "--to", "3"], ["Original", "Last", "New"]),
                ("move", ["--sheet", "2", "--to", "1"], ["Last", "Original"]),
                ("move", ["--sheet", "1", "--to", "2"], ["Last", "Original"]),
                ("add", ["--name", "New", "--index", "0"], ["New", "Original", "Last"]),
                ("add", ["--name", "New", "--index", "1"], ["Original", "New", "Last"]),
                ("move", ["--sheet", "2", "--to-index", "0"], ["Last", "Original"]),
                ("move", ["--sheet", "1", "--to-index", "1"], ["Last", "Original"]),
                ("add", ["--name", "New", "--to", "0"], None),
                ("move", ["--sheet", "1", "--to", "0"], None),
                ("add", ["--name", "New", "--index", "3"], None),
                ("move", ["--sheet", "1", "--to-index", "2"], None),
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

    def test_create_preserves_explicit_cell_fonts(self):
        spec = importlib.util.spec_from_file_location(
            "create_xlsx", SCRIPTS / "create_xlsx.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)

        def build_workbook(wb):
            cell = wb.active["A1"]
            cell.value = "Title"
            cell.font = Font(name="Courier New", size=18, bold=True)

        module.build_workbook = build_workbook
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "fonts.xlsx"
            module.build_xlsx(output)
            wb = load_workbook(output)
            self.assertEqual(wb.active["A1"].font.name, "Courier New")
            self.assertEqual(wb.active["A1"].font.sz, 18)
            self.assertTrue(wb.active["A1"].font.bold)
            wb.close()

    def test_theme_replacements_do_not_cascade(self):
        spec = importlib.util.spec_from_file_location(
            "create_xlsx", SCRIPTS / "create_xlsx.py"
        )
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        module.OFFICE_THEME_REPLACEMENTS["4F81BD"] = "C0504D"
        module.OFFICE_THEME_REPLACEMENTS["C0504D"] = "4F81BD"

        theme = module.modern_office_theme()

        self.assertEqual(theme.count("4F81BD"), 1)
        self.assertEqual(theme.count("C0504D"), 1)

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
