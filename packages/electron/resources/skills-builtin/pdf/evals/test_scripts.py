"""CLI regressions: kowork-python -B -m unittest discover -s evals -p 'test_*.py'."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIXTURES = Path(__file__).resolve().parent / "files"


class PdfScriptsTest(unittest.TestCase):
    def run_script(self, script, *args, success=True):
        result = subprocess.run(
            [sys.executable, "-B", str(SCRIPTS / f"{script}.py"), *map(str, args)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        return result

    def test_read_merge_render_and_validate(self):
        report = FIXTURES / "report.pdf"
        appendix = FIXTURES / "appendix.pdf"
        table = self.run_script("read_pdf", report, "--tables")
        self.assertIn("Widgets", table.stdout)

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "combined.pdf"
            self.run_script("pages", "merge", report, appendix, "-o", output)
            self.assertIn("OK:", self.run_script("validate", output).stdout)
            self.run_script("render", output, root / "preview", "--pages", "1")
            self.assertTrue((root / "preview" / "page_001.png").is_file())

    def test_merge_refuses_an_input_as_output(self):
        report = FIXTURES / "report.pdf"
        appendix = FIXTURES / "appendix.pdf"
        result = self.run_script(
            "pages", "merge", report, appendix, "-o", report, success=False
        )
        self.assertIn("error:", result.stderr)

    def test_merge_refuses_hard_link_alias(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.pdf"
            alias = Path(temp) / "alias.pdf"
            shutil.copyfile(FIXTURES / "report.pdf", source)
            os.link(source, alias)
            original = source.read_bytes()
            result = self.run_script(
                "pages",
                "merge",
                source,
                FIXTURES / "appendix.pdf",
                "-o",
                alias,
                success=False,
            )
            self.assertIn("error:", result.stderr)
            self.assertEqual(source.read_bytes(), original)

    def test_create_requires_pdf_extension(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "report.pfd"
            result = self.run_script("create_pdf", output, success=False)
            self.assertIn(".pdf extension", result.stderr)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
