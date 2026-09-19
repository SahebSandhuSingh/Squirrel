"""Tests for the user store — profile + skill persistence (pure, no FastAPI).

USERS_DIR is monkeypatched to a temp dir so nothing touches data/users. Covers the
`configured` semantics that fix the dashboard's Update-vs-Updated skill bug: a brand-new
profile (no skill.json) reads back configured=False.

Runs under pytest OR as a plain script (PYTHONPATH=. python3 backend/tests/test_users_store.py).
"""

from __future__ import annotations

from backend import config
from backend.users.store import create_user_record, read_profile, read_skill, write_skill

_PROFILE = {
    "first_name": "Rig", "last_name": "Test", "gender": "other",
    "height_cm": 180.0, "weight_kg": 75.0, "date_of_birth": "1990-01-01",
    "mobile": "1234567", "email": "r@t.co",
}


def test_read_profile_missing_returns_none(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path)
    assert read_profile("nobody") is None


def test_create_then_read_profile(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path)
    created = create_user_record(dict(_PROFILE))
    uid = created["user_id"]
    prof = read_profile(uid)
    assert prof is not None
    assert prof["height_cm"] == 180.0 and prof["weight_kg"] == 75.0
    assert prof["user_id"] == uid and "created_at" in prof


def test_skill_unset_reads_beginner_not_configured(tmp_path, monkeypatch):
    """The crux of the bug fix: a fresh profile has no skill.json → configured is False,
    so the dashboard shows 'Update' rather than a misleading 'Updated'."""
    monkeypatch.setattr(config, "USERS_DIR", tmp_path)
    assert read_skill("u1") == ("beginner", False)


def test_skill_write_then_read_configured(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path)
    assert write_skill("u1", "advanced") == "advanced"
    assert read_skill("u1") == ("advanced", True)


def test_skill_invalid_level_coerced_to_beginner(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "USERS_DIR", tmp_path)
    assert write_skill("u1", "wizard") == "beginner"
    assert read_skill("u1") == ("beginner", True)   # configured True — it WAS explicitly saved


if __name__ == "__main__":
    import tempfile, traceback
    from pathlib import Path

    class _MP:
        def setattr(self, obj, name, val): setattr(obj, name, val)
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    passed = 0
    for fn in fns:
        with tempfile.TemporaryDirectory() as tmp:
            _orig = config.USERS_DIR
            try:
                fn(Path(tmp), _MP())
                passed += 1
                print(f"  ok   {fn.__name__}")
            except Exception:
                print(f"  FAIL {fn.__name__}")
                traceback.print_exc()
            finally:
                config.USERS_DIR = _orig
    print(f"\n{passed}/{len(fns)} user-store tests passed")
    assert passed == len(fns)
