from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pymongo.errors import PyMongoError

try:
    from ..database import (
        get_car_accidents_collection,
        get_drivers_collection,
        get_hospitals_collection,
    )
except ImportError:  # pragma: no cover
    from database import (
        get_car_accidents_collection,
        get_drivers_collection,
        get_hospitals_collection,
    )

VALID_SEVERITIES = {"critical", "high", "moderate", "low"}
MAX_HOSPITAL_NOTIFICATIONS = 8
MAX_DRIVER_NOTIFICATIONS = 12


def _normalize_text(value: str) -> str:
    return value.strip()


def _serialize_alert(doc: dict[str, Any]) -> dict[str, Any]:
    location = doc.get("location") or {}

    return {
        "id": str(doc["_id"]),
        "car_name": doc.get("car_name", ""),
        "car_model": doc.get("car_model", ""),
        "person_name": doc.get("person_name", ""),
        "person_phone": doc.get("person_phone", ""),
        "lat": float(location.get("lat", 0.0)),
        "lng": float(location.get("lng", 0.0)),
        "severity": doc.get("severity", "high"),
        "status": doc.get("status", "new"),
        "airbags_activated": bool(doc.get("airbags_activated", True)),
        "notified_hospital_ids": list(doc.get("notified_hospital_ids", [])),
        "notified_driver_ids": list(doc.get("notified_driver_ids", [])),
        "notes": doc.get("notes", ""),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)),
    }


def _load_notified_hospitals() -> list[dict[str, str]]:
    docs = list(
        get_hospitals_collection()
        .find(
            {"status": {"$ne": "inactive"}},
            {"hospital_id": 1, "name": 1},
        )
        .limit(MAX_HOSPITAL_NOTIFICATIONS)
    )

    hospitals: list[dict[str, str]] = []
    for doc in docs:
        hospitals.append(
            {
                "hospital_id": doc.get("hospital_id") or str(doc.get("_id")),
                "name": doc.get("name") or "Hospital",
            }
        )

    return hospitals


def _load_notified_drivers() -> list[dict[str, str | None]]:
    docs = list(
        get_drivers_collection()
        .find(
            {},
            {"name": 1, "email": 1, "call_sign": 1},
        )
        .sort("created_at", -1)
        .limit(MAX_DRIVER_NOTIFICATIONS)
    )

    drivers: list[dict[str, str | None]] = []
    for doc in docs:
        drivers.append(
            {
                "driver_id": str(doc.get("_id")),
                "name": doc.get("name") or doc.get("email") or "Driver",
                "call_sign": doc.get("call_sign"),
            }
        )

    return drivers


def create_car_accident_alert(payload: dict[str, Any]) -> dict[str, Any]:
    severity = str(payload.get("severity", "high")).strip().lower()
    if severity not in VALID_SEVERITIES:
        raise ValueError(
            f"Invalid severity '{severity}'. Valid values: {sorted(VALID_SEVERITIES)}"
        )

    hospitals = _load_notified_hospitals()
    drivers = _load_notified_drivers()

    now = datetime.now(timezone.utc)
    doc = {
        "car_name": _normalize_text(payload["car_name"]),
        "car_model": _normalize_text(payload["car_model"]),
        "person_name": _normalize_text(payload["person_name"]),
        "person_phone": _normalize_text(payload["person_phone"]),
        "location": {
            "lat": float(payload["lat"]),
            "lng": float(payload["lng"]),
        },
        "severity": severity,
        "status": "new",
        "airbags_activated": bool(payload.get("airbags_activated", True)),
        "notified_hospital_ids": [item["hospital_id"] for item in hospitals],
        "notified_driver_ids": [str(item["driver_id"]) for item in drivers],
        "notes": str(payload.get("notes") or ""),
        "created_at": now,
        "updated_at": now,
    }

    result = get_car_accidents_collection().insert_one(doc)
    doc["_id"] = result.inserted_id

    return {
        "alert": _serialize_alert(doc),
        "notified_hospitals": hospitals,
        "notified_drivers": drivers,
    }


def list_car_accident_alerts(limit: int = 30) -> list[dict[str, Any]]:
    safe_limit = max(1, min(limit, 200))
    docs = list(
        get_car_accidents_collection()
        .find({})
        .sort("created_at", -1)
        .limit(safe_limit)
    )

    return [_serialize_alert(doc) for doc in docs]


def ensure_car_accident_service_ready() -> None:
    # Helper for future initialization checks; intentionally no-op for now.
    return None
