"""Read-only workout catalog API for frontend availability rendering."""

from fastapi import APIRouter

from backend.workouts.catalog import load_catalog

router = APIRouter(prefix="/api")


@router.get("/exercises")
def list_exercises() -> dict:
    catalog = load_catalog()
    return {
        "exercises": [
            {"id": entry.slug, "view": entry.view, "status": entry.status}
            for entry in catalog.exercises.values()
        ],
    }
