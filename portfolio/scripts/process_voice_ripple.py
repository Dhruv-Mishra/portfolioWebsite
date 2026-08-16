"""One-shot processor for the voice-agent ripple GIF.

Keys near-black to alpha, resizes to 448x448, and writes PNG frames for
ffmpeg / gifsicle. Not imported by the app.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

SRC = Path("portfolio/tmp/ripple-frames")
DST = Path("portfolio/tmp/ripple-alpha")
SIZE = (448, 448)


def key_frame(im: Image.Image) -> Image.Image:
    im = im.convert("RGBA").resize(SIZE, Image.Resampling.LANCZOS)
    pixels = im.load()
    if pixels is None:
        return im
    width, height = im.size
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
            chroma = max(r, g, b) - min(r, g, b)
            if chroma > 28 and luma > 22:
                continue
            if luma <= 18:
                pixels[x, y] = (r, g, b, 0)
            elif luma < 42:
                pixels[x, y] = (r, g, b, int(a * (luma - 18) / 24))
    return im


def main() -> None:
    DST.mkdir(parents=True, exist_ok=True)
    frames = sorted(SRC.glob("f-*.png"))
    if not frames:
        raise SystemExit(f"No frames in {SRC}")
    for path in frames:
        keyed = key_frame(Image.open(path))
        keyed.save(DST / path.name)
    print(f"wrote {len(frames)} keyed frames to {DST}")


if __name__ == "__main__":
    main()
