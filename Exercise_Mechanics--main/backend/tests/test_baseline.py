"""Quality-aware baseline collection and atomic document tests."""

from __future__ import annotations

import json

import pytest

from backend.training import baseline as baseline_module
from backend.training.baseline import BaselineCollector, load_baseline_document, save_baseline


def _point(x: float, *, v: float = 0.9) -> dict:
    return {"nose": {"x": x, "y": 100.0, "z": 0.0, "v": v}}


def _collector() -> BaselineCollector:
    return BaselineCollector(("nose",))


def test_empty_median_is_none_and_missing_required_landmark_never_falls_back():
    collector = _collector()
    assert collector.median() is None
    with pytest.raises(ValueError, match="missing 'nose'"):
        collector.add({})
    with pytest.raises(ValueError, match="confidence floor"):
        collector.add(_point(100, v=0.2))
    assert collector.frame_count == 0


def test_median_contains_only_valid_required_geometry_without_visibility():
    collector = _collector()
    for x in (100.0, 102.0, 900.0):
        collector.add(_point(x))
    median = collector.median()
    assert median == {"nose": {"x": 102.0, "y": 100.0, "z": 0.0}}
    assert "v" not in median["nose"]


def test_quality_reports_sample_coverage_duration_and_joint_stillness():
    collector = _collector()
    for x in (100.0, 102.0, 104.0):
        collector.add(_point(x))
    quality = collector.quality(observed_frames=4, valid_duration_ms=300)
    assert quality.valid_samples == 3
    assert quality.observed_frames == 4
    assert quality.valid_coverage == 0.75
    assert quality.valid_duration_ms == 300
    assert quality.max_joint_stddev_px == pytest.approx(1.632993)
    assert quality.joint_stddev_px["nose"]["y"] == 0


def test_atomic_save_publishes_one_geometry_and_quality_document(tmp_path):
    collector = _collector()
    for x in (100.0, 102.0, 104.0):
        collector.add(_point(x))
    median = collector.median()
    quality = collector.quality(observed_frames=3, valid_duration_ms=300)
    path = save_baseline(tmp_path, median, quality, "squat_baseline_keypoints.json")

    value = json.loads(path.read_text(encoding="utf-8"))
    assert value["schema_version"] == 1
    assert value["keypoints"] == median
    assert value["quality"]["valid_samples"] == 3
    assert list(path.parent.iterdir()) == [path]
    assert load_baseline_document(path) == (median, value["quality"])


def test_atomic_save_failure_leaves_no_published_or_temporary_file(tmp_path, monkeypatch):
    collector = _collector()
    collector.add(_point(100))
    quality = collector.quality(observed_frames=1, valid_duration_ms=0)

    def fail_replace(*_args, **_kwargs):
        raise OSError("disk unavailable")

    monkeypatch.setattr(baseline_module.os, "replace", fail_replace)
    with pytest.raises(OSError, match="disk unavailable"):
        save_baseline(
            tmp_path,
            collector.median(),
            quality,
            "squat_baseline_keypoints.json",
        )
    output = tmp_path / "baseline_kp_data"
    assert list(output.iterdir()) == []


def test_legacy_geometry_only_document_remains_readable(tmp_path):
    path = tmp_path / "legacy.json"
    path.write_text(json.dumps({"nose": {"x": 1, "y": 2}}), encoding="utf-8")
    assert load_baseline_document(path) == ({"nose": {"x": 1, "y": 2}}, None)
