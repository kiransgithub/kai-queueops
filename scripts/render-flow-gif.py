"""Assemble browser-captured flow frames into an optimized animated GIF."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("frames", type=Path, help="Directory containing frame-*.png files")
    parser.add_argument("output", type=Path, help="Destination .gif path")
    parser.add_argument("--duration", type=int, default=100, help="Frame duration in milliseconds")
    parser.add_argument("--step", type=int, default=1, help="Use every nth captured frame")
    parser.add_argument("--width", type=int, help="Resize frames to this width before encoding")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.step < 1:
        raise SystemExit("--step must be at least 1")

    frame_paths = sorted(args.frames.glob("frame-*.png"))[:: args.step]
    if not frame_paths:
        raise SystemExit(f"No frame-*.png files found in {args.frames}")

    rgb_frames = [Image.open(path).convert("RGB") for path in frame_paths]
    if args.width:
        if args.width < 1:
            raise SystemExit("--width must be at least 1")
        resized_frames = []
        for frame in rgb_frames:
            height = round(frame.height * args.width / frame.width)
            resized_frames.append(frame.resize((args.width, height), Image.Resampling.LANCZOS))
        rgb_frames = resized_frames
    palette = rgb_frames[0].quantize(
        colors=128,
        method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.NONE,
    )
    gif_frames = [
        frame.quantize(palette=palette, dither=Image.Dither.NONE)
        for frame in rgb_frames
    ]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    gif_frames[0].save(
        args.output,
        save_all=True,
        append_images=gif_frames[1:],
        duration=args.duration,
        loop=0,
        optimize=True,
        disposal=2,
    )


if __name__ == "__main__":
    main()
