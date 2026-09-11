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

    def run_create_template(self, output, *, success=True):
        node = shutil.which("node")
        if node is None or not NODE_LIBS.is_dir():
            self.skipTest("Node runtime dependencies are unavailable")
        env = os.environ.copy()
        env["NODE_PATH"] = str(NODE_LIBS)
        result = subprocess.run(
            [node, str(SCRIPTS / "create_pptx.cjs"), str(output)],
            capture_output=True,
            text=True,
            env=env,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
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
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.pptx"
            shutil.copyfile(FIXTURES / "quarterly.pptx", source)
            original = source.read_bytes()
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
            self.assertEqual(source.read_bytes(), original)

    def test_reorder_refuses_hard_link_alias(self):
        with tempfile.TemporaryDirectory() as temp:
            source = Path(temp) / "source.pptx"
            alias = Path(temp) / "alias.pptx"
            shutil.copyfile(FIXTURES / "quarterly.pptx", source)
            os.link(source, alias)
            original = source.read_bytes()
            result = self.run_script(
                "slides",
                "reorder",
                source,
                "-o",
                alias,
                "--order",
                "5,1,2,3,4",
                success=False,
            )
            self.assertIn("error:", result.stderr)
            self.assertEqual(source.read_bytes(), original)

    def test_create_requires_pptx_extension(self):
        with tempfile.TemporaryDirectory() as temp:
            output = Path(temp) / "deck.slides"
            result = self.run_create_template(output, success=False)
            self.assertIn(".pptx extension", result.stderr)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
