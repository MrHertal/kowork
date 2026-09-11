"""CLI regressions: kowork-python -B -m unittest discover -s evals -p 'test_*.py'."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIXTURES = Path(__file__).resolve().parent / "files"


class DocxScriptsTest(unittest.TestCase):
    def run_script(self, script, *args, success=True):
        result = subprocess.run(
            [sys.executable, "-B", str(SCRIPTS / f"{script}.py"), *map(str, args)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        return result

    def test_read_edit_and_validate(self):
        source = FIXTURES / "contract.docx"
        self.assertIn(
            "twelve months",
            self.run_script("read_docx", source, "--raw-text").stdout,
        )

        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "edited.docx"
            self.run_script(
                "edit_text",
                source,
                "--find",
                "twelve months",
                "--replace",
                "twenty-four months",
                "-o",
                output,
            )
            self.assertIn(
                "twenty-four months",
                self.run_script("read_docx", output, "--raw-text").stdout,
            )
            self.assertIn("OK:", self.run_script("validate", output).stdout)

    def test_edit_refuses_in_place(self):
        source = FIXTURES / "contract.docx"
        result = self.run_script(
            "edit_text",
            source,
            "--find",
            "twelve months",
            "--replace",
            "twenty-four months",
            "-o",
            source,
            success=False,
        )
        self.assertIn("error:", result.stderr)


if __name__ == "__main__":
    unittest.main()
