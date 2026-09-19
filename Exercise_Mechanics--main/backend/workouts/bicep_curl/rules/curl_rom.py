"""Curl ROM rule — the double-arm curl's range-of-motion signal + full/shallow gate.

This is one biomechanical rule kernel (template id `curl_rom`, "Short curl"), built to stand
completely on its own — no rep FSM, no phase machine, no rep counting. From a single frame's
shoulder + elbow + wrist landmarks it answers, for BOTH arms:

    1. HOW FAR HAS THE WRIST RISEN right now?  → a normalized per-arm `*_ratio` signal
    2. Is the rep deep enough for FULL?         → the `is_full_rom()` gate on the WEAKER arm

Division of responsibility (why this is FSM-free), identical to the squat depth rule:
    • This rule owns WHAT "full curl" means (one gate) and how the curl is measured.
    • A rep machine (the generic RepFSM) owns WHEN — it tracks each rep's PEAK `progress` and asks
      this rule `is_full_rom(peak)`. A rep is flagged SHALLOW when that is False but the peak still
      cleared the FSM's `min_rep_peak`; below that it is a diagnostic invalid attempt.

The measurement (the load-bearing part) — WRIST HEIGHT, not elbow angle:

    wrist_h = projection(wrist − hip_midpoint, body_up_axis)
    offset  = (baseline_shoulder_h − wrist_h) / baseline_upper_arm
    ratio    = (rest_offset − offset) / (rest_offset − target_offset)

        0.0  = the wrist hangs where the person's BASELINE put it (arm at rest)
        1.0  = the wrist has risen to `target_offset` (0.0 ⇒ wrist level with the shoulder)
        >1.0 = risen past the target (kept raw, not clamped)
        <0.0 = below the resting hang (kept raw)

    The 2D interior elbow angle this replaced is unusable on a FRONT-view camera: foreshortening
    makes shoulder-elbow-wrist near-collinear at the top of a curl, so the angle collapses from
    ~178° to a few degrees within one frame and cannot separate a shallow curl from a full one.
    Vertical wrist travel is read cleanly by a front camera and degrades gracefully.

    `rest_offset`, the shoulder target and the scale come from the persisted per-set BASELINE (arms
    hanging extended, captured at setup). A live hip midpoint removes body translation and the live
    torso axis removes rigid image rotation, but the live shoulder height is never the wrist anchor:
    shrugging is scored independently and cannot make an otherwise complete curl read shallow. The
    accepted setup fixes camera distance for the set. `z` is unreliable on a front-view camera, so
    this is a 2D measurement.

`progress` — the movement's headline value — is the WEAKER arm, `min(left_ratio, right_ratio)`. A
rep therefore only reaches the full-ROM gate when BOTH arms reach it; if one arm curls short the rep
is shallow, and the limiting side is reported so coaching can name it.

`leading_ratio` is the opposite reduction, `max(...)`, and it is what says the rep is OVER: the
movement has returned to rest only once the arm furthest through the curl is back down. Reporting
only the weaker arm would end a rep the moment the FIRST arm lowered, while the other was still
curled — see `engine.rep_fsm.RepObservation`.

Thresholds are NOT hardcoded here. `target_offset`, `min_upper_arm_px` and `full_rom_gate` are
passed verbatim from the curl template; the curl ROM signal deliberately has no hysteresis.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import hypot, isfinite

from backend.core.keypoints import reference_xy, usable_xy

RULE_ID = "curl_rom"
# Anatomical inputs are stable kernel metadata; thresholds remain in configuration. Order groups
# each arm's shoulder→elbow→wrist chain but is only used as a membership/visibility set.
REQUIRED_KEYPOINTS = (
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
)

_SIDES = ("left", "right")
# Below this the resting hang and the target coincide: the normalization would divide by ~0 and the
# ratio would explode. A pure degeneracy floor (like a zero-length segment), not a tunable.
_MIN_REST_SPAN = 1e-6
_MIN_BODY_AXIS_PX = 1e-6


def _side(side: str) -> str:
    if side not in _SIDES:
        raise ValueError(f"side must be one of {_SIDES}, got {side!r}")
    return side


@dataclass(frozen=True)
class CurlRomReading:
    """One frame's curl read. `progress` is the raw weaker-arm signal (unrounded — the rep machine
    compares peaks against the gate, so precision matters); presentation rounding is a caller
    concern."""

    progress: float          # min(left_ratio, right_ratio) — the weaker arm; the FSM signal
    leading_ratio: float     # max(left_ratio, right_ratio) — the arm furthest through the curl
    left_ratio: float        # 0.0 at the baseline hang → 1.0 at the target height (>1 beyond it)
    right_ratio: float
    left_offset: float       # raw normalized wrist offset below the baseline shoulder target
    right_offset: float
    full_rom_gate: float      # the sole full-ROM boundary from exercise config
    full_rom: bool            # did BOTH arms reach the gate (progress ≥ gate)
    left_full: bool           # did the left arm alone reach the gate
    right_full: bool          # did the right arm alone reach the gate
    weaker_side: str          # 'left' or 'right' — the limiting arm (the min)
    shortfall: float | None   # gate − progress when the weaker arm is short; None at/over the gate


class CurlRomRule:
    """Stateless-per-frame curl ROM rule. Construction fixes the person's resting reference (from
    the persisted baseline) and the gate; `read()` turns a live frame into a `CurlRomReading`; and
    `is_full_rom()` is the gate the rep machine applies to a rep's peak `progress` to decide full
    vs shallow.

    Args:
        baseline:          persisted per-set baseline keypoints (arms hanging extended).
        target_offset:     normalized wrist offset mapping to progress 1.0, in upper-arm lengths
                           below the shoulder (0.0 ⇒ wrist level with the shoulder).
        full_rom_gate:     the sole full-rep credit point on `progress` (e.g. 0.75).
        min_upper_arm_px:  reject a baseline or live frame whose shoulder→elbow span is below this.

    Raises ValueError on an unreadable baseline, an implausibly small baseline upper arm, a resting
    hang that does not sit below the target, or a non-positive gate — the wiring catches it and
    simply runs no ROM analysis rather than emitting nonsense.
    """

    def __init__(
        self,
        baseline: dict,
        target_offset: float,
        full_rom_gate: float,
        *,
        min_upper_arm_px: float,
    ) -> None:
        if not full_rom_gate > 0.0:
            raise ValueError(f"full ROM gate must be positive, got {full_rom_gate}")
        points = reference_xy(baseline, REQUIRED_KEYPOINTS)
        if points is None:
            raise ValueError(
                "curl baseline requires finite shoulder, elbow, wrist and hip coordinates"
            )

        self._target_offset = float(target_offset)
        self._min_upper_arm_px = float(min_upper_arm_px)
        self._full_rom_gate = float(full_rom_gate)
        body_frame = _body_frame(points)
        if body_frame is None:
            raise ValueError("curl baseline requires a non-degenerate shoulder-to-hip body axis")
        hip_midpoint, up_axis = body_frame

        self._rest: dict[str, float] = {}
        self._span: dict[str, float] = {}
        self._upper_arm: dict[str, float] = {}
        self._baseline_shoulder_height: dict[str, float] = {}
        for side in _SIDES:
            upper_arm = hypot(
                points[f"{side}_shoulder"][0] - points[f"{side}_elbow"][0],
                points[f"{side}_shoulder"][1] - points[f"{side}_elbow"][1],
            )
            if upper_arm < self._min_upper_arm_px:
                raise ValueError(
                    f"baseline {side} upper arm ({upper_arm:.1f}px) is below the minimum plausible "
                    f"{min_upper_arm_px}px; recapture the baseline with both arms in view."
                )
            shoulder_height = _height(
                points[f"{side}_shoulder"], hip_midpoint, up_axis
            )
            wrist_height = _height(points[f"{side}_wrist"], hip_midpoint, up_axis)
            rest = (shoulder_height - wrist_height) / upper_arm
            span = rest - self._target_offset
            if not span > _MIN_REST_SPAN:
                raise ValueError(
                    f"baseline {side} resting wrist offset ({rest:.3f}) must sit below the curl "
                    f"target ({self._target_offset}); recapture with the arms hanging extended."
                )
            self._rest[side] = rest
            self._span[side] = span
            self._upper_arm[side] = upper_arm
            self._baseline_shoulder_height[side] = shoulder_height

    # ------------------------------------------------------------------
    def read(self, keypoints: dict) -> CurlRomReading | None:
        """Compute this frame's curl progress from live shoulder, elbow, wrist and hip landmarks.

        Returns None when any required landmark is missing or below CONFIDENCE_MIN, when either
        upper arm reads implausibly short (the person is turned away or the joints have collapsed),
        or when the arithmetic is not finite — the caller must treat this frame as "no reading"
        (never advance a rep or score on partial data)."""
        pts = usable_xy(keypoints, REQUIRED_KEYPOINTS)
        if pts is None:
            return None
        body_frame = _body_frame(pts)
        if body_frame is None:
            return None
        hip_midpoint, up_axis = body_frame

        ratios: dict[str, float] = {}
        offsets: dict[str, float] = {}
        for side in _SIDES:
            shoulder = pts[f"{side}_shoulder"]
            elbow = pts[f"{side}_elbow"]
            wrist = pts[f"{side}_wrist"]
            upper_arm = hypot(shoulder[0] - elbow[0], shoulder[1] - elbow[1])
            if not upper_arm >= self._min_upper_arm_px:
                return None
            wrist_height = _height(wrist, hip_midpoint, up_axis)
            offset = (
                self._baseline_shoulder_height[side] - wrist_height
            ) / self._upper_arm[side]
            ratio = (self._rest[side] - offset) / self._span[side]
            if not (isfinite(offset) and isfinite(ratio)):
                return None
            offsets[side] = offset
            ratios[side] = ratio

        progress = min(ratios["left"], ratios["right"])
        # Both reductions are reported because a double-arm rep needs BOTH: it is full only when
        # the weaker arm reaches the gate, and over only when the LEADING arm has come back down.
        # A single scalar cannot answer both questions — see engine.rep_fsm.RepObservation.
        leading = max(ratios["left"], ratios["right"])
        # Ties resolve to the left arm; only the min value matters for the FSM signal.
        weaker_side = "left" if ratios["left"] <= ratios["right"] else "right"

        return CurlRomReading(
            progress=progress,
            leading_ratio=leading,
            left_ratio=ratios["left"],
            right_ratio=ratios["right"],
            left_offset=round(offsets["left"], 4),
            right_offset=round(offsets["right"], 4),
            full_rom_gate=self._full_rom_gate,
            full_rom=self.is_full_rom(progress),
            left_full=self.is_full_rom(ratios["left"]),
            right_full=self.is_full_rom(ratios["right"]),
            weaker_side=weaker_side,
            shortfall=(
                round(self._full_rom_gate - progress, 3)
                if progress < self._full_rom_gate
                else None
            ),
        )

    def is_full_rom(self, progress: float) -> bool:
        """The gate: True once `progress` reaches the configured full-ROM boundary. Applied to a
        rep's PEAK `progress` (the weaker arm), peak < gate ⇒ the rep is SHALLOW. The single
        definition of a full curl, so the per-frame `full_rom` and the per-rep shallow verdict can
        never disagree (both go through here)."""
        return progress >= self._full_rom_gate

    # ------------------------------------------------------------------
    @property
    def full_rom_gate(self) -> float:
        """The sole full-rep credit point."""
        return self._full_rom_gate

    def rest_offset(self, side: str) -> float:
        """This person's resting wrist offset for one arm — the signal's zero point.

        Exposed for offline analysis: when a capture's numbers look wrong, the baseline reference is
        the first thing to inspect."""
        return self._rest[_side(side)]

    def baseline_upper_arm_px(self, side: str) -> float:
        """The baseline shoulder→elbow span for one arm, in pixels — the signal's scale."""
        return self._upper_arm[_side(side)]


def _body_frame(
    points: dict[str, tuple[float, float]],
) -> tuple[tuple[float, float], tuple[float, float]] | None:
    shoulders = _midpoint(points["left_shoulder"], points["right_shoulder"])
    hips = _midpoint(points["left_hip"], points["right_hip"])
    torso = (shoulders[0] - hips[0], shoulders[1] - hips[1])
    length = hypot(*torso)
    if length < _MIN_BODY_AXIS_PX:
        return None
    return hips, (torso[0] / length, torso[1] / length)


def _height(
    point: tuple[float, float],
    origin: tuple[float, float],
    axis: tuple[float, float],
) -> float:
    return (point[0] - origin[0]) * axis[0] + (point[1] - origin[1]) * axis[1]


def _midpoint(
    left: tuple[float, float],
    right: tuple[float, float],
) -> tuple[float, float]:
    return ((left[0] + right[0]) / 2.0, (left[1] + right[1]) / 2.0)
