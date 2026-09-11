"""CLI regressions: kowork-python -B -m unittest discover -s evals -p 'test_*.py'."""
from pathlib import Path
import json
import os
import subprocess
import sys
import tempfile
import unittest

from PIL import Image, ImageCms

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
FIXTURES = Path(__file__).resolve().parent / "files"


class ImageScriptsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def run_script(self, script, *args, success=True):
        result = subprocess.run(
            [sys.executable, "-B", str(SCRIPTS / f"{script}.py"), *map(str, args)],
            capture_output=True, text=True,
        )
        self.assertEqual(result.returncode, 0 if success else 1, result.stderr)
        self.assertNotIn("Traceback", result.stderr)
        return result

    def animation(self, path, fmt="PNG"):
        Image.new("RGB", (20, 20), "red").save(
            path, fmt, save_all=True,
            append_images=[Image.new("RGB", (20, 20), "blue")], duration=[100, 300],
        )

    def test_rotation_uses_clockwise_positive_angles(self):
        source = self.root / "corners.png"
        im = Image.new("RGB", (3, 2), "white")
        im.putpixel((0, 0), (255, 0, 0))
        im.save(source)
        for degrees, corner in ((90, (1, 0)), (-90, (0, 2))):
            output = self.root / f"rotated-{degrees}.png"
            self.run_script("transform", "rotate", source, "-o", output, "--degrees", degrees, "--expand")
            with Image.open(output) as result:
                self.assertEqual(result.size, (2, 3))
                self.assertEqual(result.getpixel(corner), (255, 0, 0))

    def test_extract_protects_source_and_later_aliases(self):
        for alias in ("direct", "symlink", "hardlink"):
            with self.subTest(alias=alias):
                folder = self.root / alias
                folder.mkdir()
                source = folder / ("frame_001.png" if alias == "direct" else "input.gif")
                self.animation(source, "PNG" if alias == "direct" else "GIF")
                original = source.read_bytes()
                if alias == "symlink":
                    (folder / "frame_002.png").symlink_to(source)
                elif alias == "hardlink":
                    os.link(source, folder / "frame_002.png")
                self.run_script("gif", "extract", source, folder, success=False)
                self.assertEqual(source.read_bytes(), original)
                if alias != "direct":
                    self.assertFalse((folder / "frame_001.png").exists())

    def test_metadata_strip_and_preserve(self):
        source = self.root / "metadata.png"
        exif = Image.Exif()
        exif[271] = "PrivateCamera"
        icc = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
        Image.new("RGB", (20, 20), "red").save(source, exif=exif, icc_profile=icc)
        for ext in ("png", "tiff", "jpg", "webp"):
            for strip in (True, False):
                with self.subTest(ext=ext, strip=strip):
                    output = self.root / f"out-{strip}.{ext}"
                    self.run_script("convert", source, "-o", output, *(["--strip-metadata"] if strip else []))
                    with Image.open(output) as im:
                        self.assertEqual(im.info.get("icc_profile"), None if strip else icc)
                        self.assertEqual(im.getexif().get(271), None if strip else "PrivateCamera")
        output = self.root / "flipped.png"
        self.run_script("transform", "flip", source, "-o", output, "--horizontal")
        with Image.open(output) as im:
            self.assertFalse(im.getexif())
            self.assertNotIn("icc_profile", im.info)

    def test_metadata_strip_preserves_transparency(self):
        for mode, color, transparent in (("P", 0, 0), ("RGB", (10, 20, 30), (10, 20, 30))):
            with self.subTest(mode=mode):
                source = self.root / f"{mode}.png"
                Image.new(mode, (20, 20), color).save(source, transparency=transparent)
                output = self.root / f"{mode}-stripped.png"
                self.run_script("convert", source, "-o", output, "--strip-metadata")
                with Image.open(output) as im:
                    self.assertEqual(im.convert("RGBA").getpixel((0, 0))[3], 0)

                jpeg = self.root / f"{mode}-flattened.jpg"
                self.run_script("convert", source, "-o", jpeg, "--strip-metadata")
                with Image.open(jpeg) as im:
                    self.assertEqual(im.getpixel((0, 0)), (255, 255, 255))

    def test_adjust_unusual_modes(self):
        for mode, value, expected in (("I;16", 32768, 127), ("I;16B", 32768, 127), ("1", 1, 255)):
            with self.subTest(mode=mode):
                source = self.root / "gray.tiff"
                Image.new(mode, (20, 20), value).save(source)
                output = self.root / "adjusted.png"
                self.run_script("adjust", source, "-o", output, "--brightness", 1)
                with Image.open(output) as im:
                    self.assertEqual(im.getpixel((0, 0)), expected)

    def test_deep_grayscale_compositing(self):
        source = self.root / "gray.tiff"
        Image.new("I;16B", (80, 80), 32768).save(source)
        output = self.root / "annotated.png"
        self.run_script("annotate", "text", source, "-o", output, "--text", "Label")
        with Image.open(output) as im:
            self.assertEqual(im.getpixel((0, 0)), (127, 127, 127, 255))
        self.run_script("combine", source, source, "-o", output, "--hstack")
        with Image.open(output) as im:
            self.assertEqual(im.getpixel((0, 0)), (127, 127, 127, 255))
        base = self.root / "base.png"
        Image.new("RGB", (80, 80), "black").save(base)
        self.run_script("annotate", "watermark", base, "-o", output, "--mark", source, "--position", "center")
        with Image.open(output) as im:
            self.assertEqual(im.getpixel((40, 40)), (127, 127, 127, 255))

    def test_webp_and_gif_timing(self):
        for ext in ("webp", "gif"):
            with self.subTest(ext=ext):
                source = self.root / f"animation.{ext}"
                self.animation(source, ext.upper())
                result = self.run_script("info", source, "--json")
                info = json.loads(result.stdout)
                self.assertEqual(info["duration_ms"], 100)
                self.assertEqual(info["duration_ms_range"], [100, 300])
                self.run_script("gif", "extract", source, self.root / ext)
                self.run_script("validate", self.root / ext / "frame_002.png")

    def test_standard_workflows(self):
        photo = FIXTURES / "photo.jpg"
        output = self.root / "small.jpg"
        self.run_script("transform", "resize", photo, "-o", output, "--max", "300x300")
        with Image.open(output) as im:
            self.assertEqual(im.size, (225, 300))
        for ext in ("png", "jpg", "webp", "gif", "bmp", "tiff", "ico", "avif"):
            with self.subTest(ext=ext):
                output = self.root / f"converted.{ext}"
                self.run_script("convert", photo, "-o", output)
                self.run_script("validate", output)
        self.run_script("create_image", self.root / "card.png")
        self.run_script("validate", self.root / "card.png")
        self.run_script(
            "gif", "create", FIXTURES / "frame-1.png", FIXTURES / "frame-2.png",
            "-o", self.root / "cycle.gif",
        )
        self.run_script("validate", self.root / "cycle.gif")

    def test_create_rejects_unknown_extension(self):
        output = self.root / "card.image"
        result = self.run_script("create_image", output, success=False)
        self.assertIn("cannot infer an image format", result.stderr)
        self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
