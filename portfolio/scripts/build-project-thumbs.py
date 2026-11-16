"""Build each project's thumbnail from the last frame of its preview video.

The videos end on the finished sketchbook page with the title lettered in, so the thumbnails on the
project wall and the home carousel match the clips they open. Writes public/resources/video/<stem>.webp
(640w) and <stem>-384.webp (picked by lib/imageLoader.ts where cards render ~300px wide at 1x-1.25x)
next to <stem>.av1.mp4 and prints the blur placeholders for lib/projects.ts.

Usage (from portfolio/):
    python scripts/build-project-thumbs.py [stem ...]

Requires ffmpeg (with libdav1d) on PATH and Pillow with WebP.
"""
import base64
import io
import subprocess
import sys
from pathlib import Path

from PIL import Image

VIDEO = Path(__file__).resolve().parents[1] / "public" / "resources" / "video"
# The 640w size matches the stills they replace (the clips themselves are only 854x480); keep the small width in
# sync with lib/imageLoader.ts.
SIZES = {"": (640, 360), "-384": (384, 216)}
QUALITY = 74


def last_frame(video: Path) -> Image.Image:
    png = subprocess.run(
        ["ffmpeg", "-v", "error", "-c:v", "libdav1d", "-sseof", "-0.25", "-i", str(video),
         "-frames:v", "1", "-update", "1", "-f", "image2pipe", "-c:v", "png", "-"],
        check=True, capture_output=True,
    ).stdout
    return Image.open(io.BytesIO(png)).convert("RGB")


def main() -> None:
    wanted = set(sys.argv[1:])
    for video in sorted(VIDEO.glob("*.av1.mp4")):
        stem = video.name.removesuffix(".av1.mp4")
        if wanted and stem not in wanted:
            continue
        frame = last_frame(video)
        for suffix, size in SIZES.items():
            out = VIDEO / f"{stem}{suffix}.webp"
            frame.resize(size, Image.LANCZOS).save(out, "WEBP", quality=QUALITY, method=6)
            print(f"// {out.name} {out.stat().st_size} B")
        blur = io.BytesIO()
        frame.resize(SIZES[""], Image.LANCZOS).resize((8, 5), Image.LANCZOS).save(blur, "WEBP", quality=50, method=6)
        print(f"'{stem}': 'data:image/webp;base64,{base64.b64encode(blur.getvalue()).decode()}',")


if __name__ == "__main__":
    main()
