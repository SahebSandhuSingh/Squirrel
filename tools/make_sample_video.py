#!/usr/bin/env python3
"""Build a sample video for streaming tests, from a still photo of a person.

Why from a photo: MediaPipe needs a real human body to return real landmarks, so
a drawn stick figure would only ever produce "no pose detected" and would test
nothing but the plumbing. Animating a real photo (slow pan, slight zoom,
brightness drift, sensor noise) gives a stream that yields genuine landmarks,
genuine joint angles and genuine orientation verdicts — enough to verify the live
path, the frame rate and the latency budget end to end.

What it does NOT give you is movement through a rep, because a still photo has
none. For rep-level behaviour, point tools/test_client.py at a real workout clip.

    # animate your own photo (ideally someone standing side-on to the camera)
    python tools/make_sample_video.py --image me_side_on.jpg --out sample.mp4

    # or fetch MediaPipe's public sample photo and animate that
    python tools/make_sample_video.py --download --out sample.mp4
"""

from __future__ import annotations

import argparse
import math
import urllib.request
from pathlib import Path

import cv2
import numpy as np

#: MediaPipe's public sample photo of a person — a convenient stand-in subject.
SAMPLE_IMAGE_URL = "https://storage.googleapis.com/mediapipe-assets/pose.jpg"


def load_image(args) -> np.ndarray:
    if args.download:
        destination = Path(args.image or "models/sample_person.jpg")
        destination.parent.mkdir(parents=True, exist_ok=True)
        if not destination.exists():
            print(f"downloading {SAMPLE_IMAGE_URL} -> {destination}")
            urllib.request.urlretrieve(SAMPLE_IMAGE_URL, destination)  # noqa: S310
        path = destination
    else:
        if not args.image:
            raise SystemExit("pass --image PATH, or --download to fetch a sample")
        path = Path(args.image)
    image = cv2.imread(str(path))
    if image is None:
        raise SystemExit(f"could not read image: {path}")
    return image


def render(image: np.ndarray, args) -> None:
    height, width = args.height, args.width
    total_frames = int(args.seconds * args.fps)
    writer = cv2.VideoWriter(
        args.out, cv2.VideoWriter_fourcc(*"mp4v"), args.fps, (width, height)
    )
    if not writer.isOpened():
        raise SystemExit(f"could not open {args.out} for writing")

    # Fit the subject into the frame with room for the pan/zoom to move around.
    scale = min(width / image.shape[1], height / image.shape[0]) * 1.15
    fitted = cv2.resize(
        image,
        (max(1, int(image.shape[1] * scale)), max(1, int(image.shape[0] * scale))),
        interpolation=cv2.INTER_AREA,
    )

    rng = np.random.default_rng(seed=7)
    for index in range(total_frames):
        phase = 2.0 * math.pi * index / max(1, args.fps * 4)
        # Hand-held camera: a slow drift plus a little zoom breathing.
        zoom = 1.0 + 0.03 * math.sin(phase)
        dx = int(12 * math.sin(phase * 0.7))
        dy = int(8 * math.cos(phase * 0.5))
        zoomed = cv2.resize(
            fitted,
            (max(1, int(fitted.shape[1] * zoom)), max(1, int(fitted.shape[0] * zoom))),
            interpolation=cv2.INTER_LINEAR,
        )

        canvas = np.zeros((height, width, 3), dtype=np.uint8)
        canvas[:] = (28, 30, 34)
        top = (height - zoomed.shape[0]) // 2 + dy
        left = (width - zoomed.shape[1]) // 2 + dx
        # Copy the overlapping region only, so drift near the edges is safe.
        src_top, dst_top = max(0, -top), max(0, top)
        src_left, dst_left = max(0, -left), max(0, left)
        copy_h = min(zoomed.shape[0] - src_top, height - dst_top)
        copy_w = min(zoomed.shape[1] - src_left, width - dst_left)
        if copy_h > 0 and copy_w > 0:
            canvas[dst_top:dst_top + copy_h, dst_left:dst_left + copy_w] = zoomed[
                src_top:src_top + copy_h, src_left:src_left + copy_w
            ]

        # Exposure drift and sensor noise, so consecutive frames are not identical
        # (identical frames would flatter the tracker unrealistically).
        canvas = cv2.convertScaleAbs(
            canvas, alpha=1.0 + 0.02 * math.sin(phase * 1.3), beta=0.0
        )
        if args.noise > 0:
            noise = rng.normal(0.0, args.noise, canvas.shape).astype(np.int16)
            canvas = np.clip(canvas.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        writer.write(canvas)

    writer.release()
    print(
        f"wrote {args.out}: {total_frames} frames, {args.seconds}s @ {args.fps} FPS, "
        f"{width}x{height}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--image", help="photo of a person to animate")
    parser.add_argument("--download", action="store_true",
                        help="fetch MediaPipe's public sample photo first")
    parser.add_argument("--out", default="sample_stream.mp4")
    parser.add_argument("--seconds", type=float, default=10.0)
    parser.add_argument("--fps", type=int, default=30)
    parser.add_argument("--width", type=int, default=720)
    parser.add_argument("--height", type=int, default=1280)
    parser.add_argument("--noise", type=float, default=3.0,
                        help="sensor noise sigma; 0 disables")
    args = parser.parse_args()
    render(load_image(args), args)


if __name__ == "__main__":
    main()
