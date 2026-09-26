"""Front-view shoulder elevation (shrug), corrected for the tracker's curl-height distortion.

THE MEASUREMENT, identical for the baseline frame and every live frame:

    shoulder_mid = midpoint(left_shoulder, right_shoulder)
    hip_mid      = midpoint(left_hip, right_hip)
    up           = normalise(shoulder_mid - hip_mid)      # the torso's own upward axis
    height[side] = dot(shoulder[side] - hip_mid, up) / baseline_shoulder_width

Working in the torso's own frame removes camera translation and body roll; dividing by shoulder width
removes camera distance. `rise` is the live height minus the baseline height, per side: 0 at rest,
positive when the shoulder sits higher than it did at rest.

The denominator is the BASELINE width, fixed for the set, never the live width. A double-arm curl
protracts the girdle and narrows the apparent shoulders ~8.4% at the top of every rep — measured on
CLEAN reps in labelled session 20260720T071533 — while a deliberate shrug adds only ~3% on top of
that. A live denominator therefore reports the curl, not the shrug: on that same capture a
height-to-width ratio fired for 1.6-3.0s on every clean rep at every threshold tried, and by 0.15
clean and shrug reps were fully interleaved. Vertical rise separates them; narrowing does not.

THE CURL-HEIGHT CORRECTION. Raw rise is not enough, because the tracker itself lifts the shoulder
landmark as the wrists come up — smoothly, monotonically, and by as much as a real shrug. So the
expected distortion is subtracted before judging:

    curl_height  = highest wrist height - BASELINE lowest shoulder height
    expected     = slope x (curl_height - baseline_curl_height)
    elevation    = rise - expected

Anchoring `expected` at the person's OWN baseline curl height is what keeps this body-independent:
at rest the term is zero by construction, so no per-person intercept is needed and `slope` is the
only tunable. Someone with longer arms simply has a different baseline_curl_height.

Curl height is measured against the BASELINE shoulder, never the live one. Referencing the live
shoulder feeds the signal back into its own corrector: a shrug raises the shoulder, which lowers the
apparent curl height, which shrinks the correction, which inflates the elevation. That loop makes the
rule report more than it measured. With the fixed reference, curl height depends only on where the
wrists are.

One scalar curl height drives both sides deliberately. The distortion is a whole-girdle effect, not
a per-side one: in session 20260720T061234 the shoulder that lifted was the one OPPOSITE the raised
wrist, so attributing it per-arm would mispredict it.

Positive elevation means the shoulder is higher than the curl height alone explains. Negative is
shoulder depression, which is not a shrug fault.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import hypot

from backend.core.keypoints import reference_xy, usable_xy
from backend.engine.range_policy import NumericRangePolicy

RULE_ID = "shoulder_elevation"
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_hip",
    "right_hip",
    "left_wrist",
    "right_wrist",
)
SIGNAL_MODE = "baseline_relative_rise_curl_corrected"
SIDES = ("left", "right")
NORMALIZED_SIGNAL_DECIMALS = 6


@dataclass(frozen=True)
class ShoulderFrame:
    """One frame in the normalised torso frame."""

    left_height: float
    right_height: float
    wrist_height: float          # the higher of the two wrists
    shoulder_reference: float    # the lower of the two shoulders, in this same frame
    shoulder_width_px: float
    torso_length_px: float

    @property
    def own_curl_height(self) -> float:
        """Curl height against this frame's OWN shoulders — meaningful only for the baseline."""
        return self.wrist_height - self.shoulder_reference


@dataclass(frozen=True)
class ShoulderElevationReading:
    """Per-side elevation above baseline, after the curl-height correction."""

    left_elevation: float
    right_elevation: float
    max_elevation: float
    # Kept for replay analysis and tuning: the uncorrected rise and the term subtracted from it.
    raw_rise: float
    expected_rise: float
    curl_height: float


@dataclass(frozen=True)
class ShoulderElevationVerdict:
    left_elevation: float
    right_elevation: float
    max_elevation: float
    state: str
    skeleton_color: str
    not_ok: bool
    side: str | None  # left | right | both | None


class ShoulderElevationSignal:
    """Measure both shoulders against the set baseline, corrected for curl height."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        baseline: dict,
        mode: str,
        *,
        min_shoulder_width_px: float,
        min_torso_length_px: float,
        curl_height_slope: float,
    ) -> None:
        if mode != SIGNAL_MODE:
            raise ValueError(f"unsupported shoulder-elevation signal mode: {mode!r}")
        self._min_shoulder_width_px = float(min_shoulder_width_px)
        self._min_torso_length_px = float(min_torso_length_px)
        self._slope = float(curl_height_slope)
        points = reference_xy(baseline, REQUIRED_KEYPOINTS)
        if points is None:
            raise ValueError(
                "shoulder-elevation baseline requires both shoulders, hips and wrists"
            )
        frame = self._frame(points, scale_px=None)
        if frame is None:
            raise ValueError(
                "shoulder-elevation baseline shoulder width or torso length is implausibly small"
            )
        self._baseline = frame
        self._baseline_curl_height = frame.own_curl_height

    @property
    def baseline(self) -> ShoulderFrame:
        """The stored standing reference; the first thing to check when numbers look wrong."""
        return self._baseline

    def read(self, keypoints: dict) -> ShoulderElevationReading | None:
        points = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        if points is None:
            return None
        frame = self._frame(points, scale_px=self._baseline.shoulder_width_px)
        if frame is None:
            return None
        # Against the BASELINE shoulder, so a shrug cannot shrink its own correction.
        curl_height = frame.wrist_height - self._baseline.shoulder_reference
        expected = self._slope * (curl_height - self._baseline_curl_height)
        left = frame.left_height - self._baseline.left_height - expected
        right = frame.right_height - self._baseline.right_height - expected
        raw = max(
            frame.left_height - self._baseline.left_height,
            frame.right_height - self._baseline.right_height,
        )
        return ShoulderElevationReading(
            left,
            right,
            max(left, right),
            raw,
            expected,
            curl_height,
        )

    def _frame(
        self,
        points: dict[str, tuple[float, float]],
        *,
        scale_px: float | None,
    ) -> ShoulderFrame | None:
        """`scale_px` None means "use this frame's own width" — correct ONLY for the baseline frame
        that defines the scale. Live frames pass the baseline width."""
        shoulder_mid = _midpoint(points["left_shoulder"], points["right_shoulder"])
        hip_mid = _midpoint(points["left_hip"], points["right_hip"])
        torso = (shoulder_mid[0] - hip_mid[0], shoulder_mid[1] - hip_mid[1])
        torso_length = hypot(*torso)
        if torso_length < self._min_torso_length_px:
            return None
        up = (torso[0] / torso_length, torso[1] / torso_length)
        # Perpendicular to up, so the span is measured across the body even if the torso is rolled.
        across = (-up[1], up[0])
        span = (
            points["left_shoulder"][0] - points["right_shoulder"][0],
            points["left_shoulder"][1] - points["right_shoulder"][1],
        )
        shoulder_width = abs(_dot(span, across))
        if shoulder_width < self._min_shoulder_width_px:
            return None
        scale = shoulder_width if scale_px is None else scale_px

        def height(name: str) -> float:
            point = points[name]
            return _dot((point[0] - hip_mid[0], point[1] - hip_mid[1]), up) / scale

        shoulders = {side: height(f"{side}_shoulder") for side in SIDES}
        wrists = [height(f"{side}_wrist") for side in SIDES]
        return ShoulderFrame(
            shoulders["left"],
            shoulders["right"],
            max(wrists),
            min(shoulders.values()),
            shoulder_width,
            torso_length,
        )


class ShoulderElevationRule:
    """Classify both corrected elevations with one YAML range table."""

    required_keypoints = REQUIRED_KEYPOINTS

    def __init__(
        self,
        baseline: dict,
        mode: str,
        ranges: object,
        *,
        min_shoulder_width_px: float,
        min_torso_length_px: float,
        curl_height_slope: float,
    ) -> None:
        self._signal = ShoulderElevationSignal(
            baseline,
            mode,
            min_shoulder_width_px=min_shoulder_width_px,
            min_torso_length_px=min_torso_length_px,
            curl_height_slope=curl_height_slope,
        )
        self._policy = NumericRangePolicy(ranges)

    def read(self, keypoints: dict) -> ShoulderElevationVerdict | None:
        reading = self._signal.read(keypoints)
        if reading is None:
            return None
        left = self._classify(reading.left_elevation)
        right = self._classify(reading.right_elevation)
        faults = [side for side, value in zip(SIDES, (left, right)) if value.state == "not_ok"]
        side = "both" if len(faults) == 2 else (faults[0] if faults else None)
        classifications = (left, right)
        state = (
            "not_ok"
            if any(value.state == "not_ok" for value in classifications)
            else "warning"
            if any(value.state == "warning" for value in classifications)
            else "safe"
        )
        selected = next(value for value in classifications if value.state == state)
        return ShoulderElevationVerdict(
            reading.left_elevation,
            reading.right_elevation,
            reading.max_elevation,
            state,
            selected.skeleton_color,
            state == "not_ok",
            side,
        )

    def reset(self) -> None:
        """Stateless rule compatibility hook."""

    @property
    def baseline(self) -> ShoulderFrame:
        return self._signal.baseline

    def _classify(self, value: float):
        return self._policy.classify(round(value, NORMALIZED_SIGNAL_DECIMALS))


def _midpoint(a: tuple[float, float], b: tuple[float, float]) -> tuple[float, float]:
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _dot(a: tuple[float, float], b: tuple[float, float]) -> float:
    return a[0] * b[0] + a[1] * b[1]
