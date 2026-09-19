"""Tests for the bicep curl setup adapter and its combined pre-check gate.

The pre-check requires two conditions held together — shoulder-width stance AND both arms extended —
before the timer + baseline capture start. These drive the adapter directly and through the generic
SetupOrchestrator, so no catalog-enabled entry is needed (curl is still planned).
"""

from __future__ import annotations

from pathlib import Path

from backend.engine.loader import validate_exercise_config
from backend.training.setup_config import build_setup_config
from backend.training.setup_flow import COLLECTING, PRECHECK, SetupOrchestrator
from backend.workouts.bicep_curl.setup_adapter import BicepCurlSetupAdapter

_CURL_DIR = Path(__file__).resolve().parents[1] / "workouts" / "bicep_curl"
_CONFIG = validate_exercise_config("bicep_curl", _CURL_DIR)
_PRECHECK_TEMPLATES = ("stance_width", "arms_extended")


def _adapter() -> BicepCurlSetupAdapter:
    return BicepCurlSetupAdapter(_CONFIG)


def _kps(
    *,
    left_wrist=(100.0, 300.0),
    right_wrist=(200.0, 300.0),
    left_ankle_x=100.0,
    right_ankle_x=200.0,
    v=0.9,
) -> dict:
    """A standing frame: shoulders 100 px apart, arms straight down (elbow ~180°), ankles at
    shoulder width (ratio ~1.0). Override a wrist to bend an arm, or an ankle to change stance."""
    def p(x, y):
        return {"x": x, "y": y, "v": v}

    return {
        "left_shoulder": p(100.0, 100.0), "right_shoulder": p(200.0, 100.0),
        "left_elbow": p(100.0, 200.0), "right_elbow": p(200.0, 200.0),
        "left_wrist": p(*left_wrist), "right_wrist": p(*right_wrist),
        "left_hip": p(110.0, 300.0), "right_hip": p(190.0, 300.0),
        "left_ankle": p(left_ankle_x, 400.0), "right_ankle": p(right_ankle_x, 400.0),
    }


def _by_id(results):
    return {r.template_id: r for r in results}


# --------------------------------------------------------------- adapter conditions

def test_extended_arms_and_good_stance_pass():
    results = _adapter().evaluate(_PRECHECK_TEMPLATES, _kps())
    by_id = _by_id(results)
    assert by_id["arms_extended"].passed
    assert by_id["stance_width"].passed


def test_bent_arm_fails_arms_extended():
    # Left wrist swung forward -> left elbow well under 150°.
    results = _adapter().evaluate(_PRECHECK_TEMPLATES, _kps(left_wrist=(180.0, 240.0)))
    arms = _by_id(results)["arms_extended"]
    assert not arms.passed
    assert arms.reason_id == "arms_not_extended"
    assert arms.cue  # a corrective cue is surfaced


def test_narrow_stance_fails_stance_even_with_extended_arms():
    results = _adapter().evaluate(_PRECHECK_TEMPLATES, _kps(left_ankle_x=130.0, right_ankle_x=170.0))
    by_id = _by_id(results)
    assert by_id["arms_extended"].passed
    assert not by_id["stance_width"].passed
    assert by_id["stance_width"].reason_id == "stance_too_narrow"


def test_missing_arm_keypoint_is_unavailable():
    frame = _kps()
    del frame["right_elbow"]
    arms = _by_id(_adapter().evaluate(_PRECHECK_TEMPLATES, frame))["arms_extended"]
    assert arms.status == "unavailable"


def test_evaluate_preserves_requested_order():
    results = _adapter().evaluate(_PRECHECK_TEMPLATES, _kps())
    assert tuple(r.template_id for r in results) == _PRECHECK_TEMPLATES


# ------------------------------------------------------------- baseline validation

def test_curl_flow_baseline_capture_has_no_condition_templates():
    """The real curl flow condition-validates only in pre-check: the baseline capture records
    keypoints + median with no condition templates, so validate_baseline is a trivial pass."""
    setup = build_setup_config(_CONFIG)
    assert setup.baseline_capture_templates == ()
    baseline = {name: {"x": lm["x"], "y": lm["y"]} for name, lm in _kps().items()}
    validation = _adapter().validate_baseline(baseline, None, setup.baseline_capture_templates)
    assert validation.passed


def test_validate_baseline_method_still_evaluates_given_conditions():
    """Adapter-method contract: if asked to validate conditions on a reference, it does — used by
    exercises (e.g. squat) that do gate the capture window."""
    good = {name: {"x": lm["x"], "y": lm["y"]} for name, lm in _kps().items()}
    assert _adapter().validate_baseline(good, None, _PRECHECK_TEMPLATES).passed
    bent_frame = _kps(right_wrist=(120.0, 240.0))
    bent = {name: {"x": lm["x"], "y": lm["y"]} for name, lm in bent_frame.items()}
    assert not _adapter().validate_baseline(bent, None, _PRECHECK_TEMPLATES).passed


# ------------------------------------------------- combined gate via the orchestrator

def _orchestrator() -> SetupOrchestrator:
    return SetupOrchestrator(build_setup_config(_CONFIG), _adapter())


def test_gate_advances_only_after_both_conditions_held_stable():
    orch = _orchestrator()
    # Hold a valid standing-extended frame across the 2 s stability window.
    status = orch.update(_kps(), 0.0)
    assert status.phase == PRECHECK
    status = orch.update(_kps(), 2100.0)
    assert status.phase == COLLECTING  # timer + baseline capture begins


def test_gate_does_not_advance_while_an_arm_is_bent():
    orch = _orchestrator()
    orch.update(_kps(left_wrist=(180.0, 240.0)), 0.0)
    status = orch.update(_kps(left_wrist=(180.0, 240.0)), 3000.0)
    assert status.phase == PRECHECK  # bent arm never satisfies the combined gate


def test_bent_arm_resets_the_stability_timer():
    orch = _orchestrator()
    orch.update(_kps(), 0.0)                               # valid, timer starts
    orch.update(_kps(left_wrist=(180.0, 240.0)), 1000.0)  # arm bends -> timer resets
    status = orch.update(_kps(), 2500.0)                  # valid again, but only 0 ms held
    assert status.phase == PRECHECK
