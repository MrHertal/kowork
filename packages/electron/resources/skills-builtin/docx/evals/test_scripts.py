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
NODE_LIBS = SCRIPTS.parents[2] / "runtime" / "node_libs"


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

    def run_create_template(self, output, *, success=True):
        launcher = shutil.which("kowork-node")
        node = shutil.which("node")
        if launcher is None or node is None or not NODE_LIBS.is_dir():
            self.skipTest("Node runtime dependencies are unavailable")
        env = os.environ.copy()
        env["KOWORK_ELECTRON_BIN"] = node
        result = subprocess.run(
            [launcher, str(SCRIPTS / "create_docx.cjs"), str(output)],
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
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
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.docx"
            shutil.copyfile(FIXTURES / "contract.docx", source)
            original = source.read_bytes()
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
            self.assertEqual(source.read_bytes(), original)

    def test_edit_refuses_hard_link_alias(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.docx"
            alias = Path(temp) / "alias.docx"
            shutil.copyfile(FIXTURES / "contract.docx", source)
            os.link(source, alias)
            original = source.read_bytes()
            result = self.run_script(
                "edit_text",
                source,
                "--find",
                "twelve months",
                "--replace",
                "twenty-four months",
                "-o",
                alias,
                success=False,
            )
            self.assertIn("error:", result.stderr)
            self.assertEqual(source.read_bytes(), original)

    def test_create_requires_docx_extension(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "document.word"
            result = self.run_create_template(output, success=False)
            self.assertIn(".docx extension", result.stderr)
            self.assertFalse(output.exists())

    def test_edit_requires_docx_extension(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "document.dotx"
            result = self.run_script(
                "edit_text",
                FIXTURES / "contract.docx",
                "--find",
                "twelve months",
                "--replace",
                "twenty-four months",
                "-o",
                output,
                success=False,
            )
            self.assertIn("template output", result.stderr)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
