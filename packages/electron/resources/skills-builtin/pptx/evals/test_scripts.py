"""CLI regressions: kowork-python -B -m unittest discover -s evals -p 'test_*.py'."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIXTURES = Path(__file__).resolve().parent / "files"


class PptxScriptsTest(unittest.TestCase):
    def run_script(self, script, *args, success=True):
        result = subprocess.run(
            [sys.executable, "-B", str(SCRIPTS / f"{script}.py"), *map(str, args)],
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        return result

    def test_read_reorder_and_validate(self):
        source = FIXTURES / "quarterly.pptx"
        read = self.run_script("read_pptx", source, "--format", "md")
        self.assertIn("Quarterly Review", read.stdout)
        self.assertIn("Thank the team and invite questions.", read.stdout)

        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "reordered.pptx"
            self.run_script(
                "slides", "reorder", source, "-o", output, "--order", "5,1,2,3,4"
            )
            info = self.run_script("slides", "info", output)
            self.assertIn("Thank You", info.stdout)
            self.assertIn("OK:", self.run_script("validate", output).stdout)

    def test_reorder_refuses_in_place(self):
        source = FIXTURES / "quarterly.pptx"
        result = self.run_script(
            "slides",
            "reorder",
            source,
            "-o",
            source,
            "--order",
            "5,1,2,3,4",
            success=False,
        )
        self.assertIn("error:", result.stderr)


if __name__ == "__main__":
    unittest.main()
