"""BlazePose 33-landmark model: indices, container, and coordinate access.

``PoseLandmarks`` is the single representation of one frame's pose that flows
through smoothing -> validation -> angle extraction -> classification. It keeps
the raw MediaPipe-normalised values (what the mobile app and the next module
want to see) and exposes aspect-corrected points for angle maths.
"""

from __future__ import annotations

from enum import IntEnum
from typing import Iterable, List, Sequence

import numpy as np

from .geometry import Point, midpoint

__all__ = [
    "LM",
    "LANDMARK_COUNT",
    "PoseLandmarks",
    "LandmarkDict",
    "SIDE_JOINTS",
    "FULL_BODY_GROUPS",
]

LANDMARK_COUNT = 33

#: Column layout of the (33, 4) landmark array used everywhere in this package.
X, Y, Z, VIS = 0, 1, 2, 3


class LM(IntEnum):
    """MediaPipe BlazePose landmark indices (all 33, in MediaPipe order)."""

    NOSE = 0
    LEFT_EYE_INNER = 1
    LEFT_EYE = 2
    LEFT_EYE_OUTER = 3
    RIGHT_EYE_INNER = 4
    RIGHT_EYE = 5
    RIGHT_EYE_OUTER = 6
    LEFT_EAR = 7
    RIGHT_EAR = 8
    MOUTH_LEFT = 9
    MOUTH_RIGHT = 10
    LEFT_SHOULDER = 11
    RIGHT_SHOULDER = 12
    LEFT_ELBOW = 13
    RIGHT_ELBOW = 14
    LEFT_WRIST = 15
    RIGHT_WRIST = 16
    LEFT_PINKY = 17
    RIGHT_PINKY = 18
    LEFT_INDEX = 19
    RIGHT_INDEX = 20
    LEFT_THUMB = 21
    RIGHT_THUMB = 22
    LEFT_HIP = 23
    RIGHT_HIP = 24
    LEFT_KNEE = 25
    RIGHT_KNEE = 26
    LEFT_ANKLE = 27
    RIGHT_ANKLE = 28
    LEFT_HEEL = 29
    RIGHT_HEEL = 30
    LEFT_FOOT_INDEX = 31
    RIGHT_FOOT_INDEX = 32


#: Per-side joint chains. "Side-on" means one body side faces the camera, so
#: analysis runs on whichever side is better tracked (see ``PoseLandmarks.best_side``).
SIDE_JOINTS: dict[str, dict[str, LM]] = {
    "left": {
        "shoulder": LM.LEFT_SHOULDER,
        "elbow": LM.LEFT_ELBOW,
        "wrist": LM.LEFT_WRIST,
        "hip": LM.LEFT_HIP,
        "knee": LM.LEFT_KNEE,
        "ankle": LM.LEFT_ANKLE,
    },
    "right": {
        "shoulder": LM.RIGHT_SHOULDER,
        "elbow": LM.RIGHT_ELBOW,
        "wrist": LM.RIGHT_WRIST,
        "hip": LM.RIGHT_HIP,
        "knee": LM.RIGHT_KNEE,
        "ankle": LM.RIGHT_ANKLE,
    },
}

#: Body regions that must all be present in frame for "full body visible".
#: Checked per GROUP (at least one landmark of the group visible and in frame)
#: rather than per landmark, because in a correct side-on view the far-side
#: limbs are legitimately occluded and carry low visibility.
FULL_BODY_GROUPS: dict[str, tuple[LM, ...]] = {
    "head": (LM.NOSE, LM.LEFT_EAR, LM.RIGHT_EAR),
    "shoulders": (LM.LEFT_SHOULDER, LM.RIGHT_SHOULDER),
    "elbows": (LM.LEFT_ELBOW, LM.RIGHT_ELBOW),
    "wrists": (LM.LEFT_WRIST, LM.RIGHT_WRIST),
    "hips": (LM.LEFT_HIP, LM.RIGHT_HIP),
    "knees": (LM.LEFT_KNEE, LM.RIGHT_KNEE),
    "ankles": (LM.LEFT_ANKLE, LM.RIGHT_ANKLE),
}

#: JSON shape of a single landmark in the per-frame response.
LandmarkDict = dict


class PoseLandmarks:
    """One frame of pose, as a (33, 4) array of ``[x, y, z, visibility]``.

    ``x`` / ``y`` are MediaPipe-normalised ([0, 1] of frame width / height,
    y downward); ``z`` is MediaPipe's rough depth (same scale as x, hip-origin,
    noisy — this package never uses z for angles); ``visibility`` is [0, 1].

    ``aspect`` is frame_width / frame_height and is applied only when handing
    points to geometry helpers, so angles are not skewed by non-square frames.
    """

    __slots__ = ("array", "aspect", "width", "height")

    def __init__(self, array: np.ndarray, width: int, height: int) -> None:
        if array.shape != (LANDMARK_COUNT, 4):
            raise ValueError(
                f"expected a ({LANDMARK_COUNT}, 4) landmark array, got {array.shape}"
            )
        self.array = np.asarray(array, dtype=np.float32)
        self.width = int(width)
        self.height = int(height)
        self.aspect = (float(width) / float(height)) if height else 1.0

    # -- construction -------------------------------------------------------

    @classmethod
    def from_mediapipe(cls, pose_landmarks, width: int, height: int) -> "PoseLandmarks":
        """Build from a MediaPipe ``NormalizedLandmarkList``."""
        array = np.empty((LANDMARK_COUNT, 4), dtype=np.float32)
        for i, lm in enumerate(pose_landmarks.landmark):
            array[i] = (lm.x, lm.y, lm.z, lm.visibility)
        return cls(array, width, height)

    @classmethod
    def from_rows(
        cls, rows: Sequence[Sequence[float]], width: int = 720, height: int = 1280
    ) -> "PoseLandmarks":
        """Build from 33 ``(x, y, z, visibility)`` rows — used by unit tests."""
        return cls(np.asarray(rows, dtype=np.float32), width, height)

    def replace_array(self, array: np.ndarray) -> "PoseLandmarks":
        """Same frame geometry, different landmark values (used by smoothing)."""
        return PoseLandmarks(array, self.width, self.height)

    # -- access -------------------------------------------------------------

    def point(self, lm: LM) -> Point:
        """Aspect-corrected (x, y) for angle maths."""
        row = self.array[int(lm)]
        return (float(row[X]) * self.aspect, float(row[Y]))

    def raw_xy(self, lm: LM) -> Point:
        """Un-corrected normalised (x, y) — for image-space comparisons."""
        row = self.array[int(lm)]
        return (float(row[X]), float(row[Y]))

    def visibility(self, lm: LM) -> float:
        return float(self.array[int(lm)][VIS])

    def mid_point(self, a: LM, b: LM) -> Point:
        """Aspect-corrected midpoint of two landmarks (e.g. the two shoulders)."""
        return midpoint(self.point(a), self.point(b))

    def min_visibility(self, lms: Iterable[LM]) -> float:
        idx = [int(lm) for lm in lms]
        return float(self.array[idx, VIS].min()) if idx else 0.0

    def mean_visibility(self, lms: Iterable[LM]) -> float:
        idx = [int(lm) for lm in lms]
        return float(self.array[idx, VIS].mean()) if idx else 0.0

    def best_side(self) -> str:
        """Which body side is better tracked: ``"left"`` or ``"right"``.

        In a correct side-on view the camera-facing side is tracked with clearly
        higher visibility than the occluded far side, so this picks the limb
        chain the joint-angle maths should use.
        """
        scores = {
            side: self.mean_visibility(joints.values())
            for side, joints in SIDE_JOINTS.items()
        }
        return "left" if scores["left"] >= scores["right"] else "right"

    def side_joints(self, side: str | None = None) -> dict[str, LM]:
        """Joint-name -> landmark index map for one side (default: best side)."""
        return SIDE_JOINTS[side or self.best_side()]

    # -- serialisation ------------------------------------------------------

    def to_json(self, decimals: int = 4) -> List[LandmarkDict]:
        """All 33 landmarks as JSON-ready dicts, in MediaPipe index order.

        Emitted verbatim in every frame response so downstream modules
        (rep counting, depth analysis) never need to re-run pose detection.
        """
        rounded = np.round(self.array.astype(np.float64), decimals)
        return [
            {
                "index": i,
                "name": LM(i).name.lower(),
                "x": float(r[X]),
                "y": float(r[Y]),
                "z": float(r[Z]),
                "visibility": float(r[VIS]),
            }
            for i, r in enumerate(rounded)
        ]
