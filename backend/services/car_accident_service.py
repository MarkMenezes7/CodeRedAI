from __future__ import annotations

from datetime import datetime, timezone
from math import cos, pi, sqrt
from typing import Any

from bson import ObjectId
from pymongo.errors import PyMongoError

try:
    from ..database import (
        get_car_accidents_collection,
        get_drivers_collection,
        get_emergencies_collection,
        get_hospitals_collection,
    )
except ImportError:  # pragma: no cover
    from database import (
        get_car_accidents_collection,
        get_drivers_collection,
        get_emergencies_collection,
        get_hospitals_collection,
    )

VALID_SEVERITIES = {"critical", "high", "moderate", "low"}
MAX_HOSPITAL_NOTIFICATIONS = 5
MAX_DRIVER_NOTIFICATIONS = 5
MAX_NOTIFICATION_RADIUS_M = 20_000


def _normalize_text(value: str) -> str:
    return value.strip()


def _canonical_hospital_id(doc: dict[str, Any]) -> str:
    hospital_id = str(doc.get("hospital_id") or "").strip()
    if hospital_id:
        return hospital_id

    hospital_name = str(doc.get("name") or "").strip()
    if hospital_name.upper().startswith("HSP-"):
        return hospital_name.upper()

    return str(doc.get("_id"))


def _oid(alert_id: str) -> ObjectId:
    try:
        return ObjectId(alert_id)
    except Exception as exc:
        raise ValueError(f"Invalid alert id format: {alert_id!r}") from exc


def _extract_hospital_geo(doc: dict[str, Any]) -> tuple[float | None, float | None]:
    return _extract_geo_point(doc)


def _extract_geo_point(doc: dict[str, Any]) -> tuple[float | None, float | None]:
    location = doc.get("location") or {}

    if isinstance(location, dict):
        if location.get("type") == "Point" and isinstance(location.get("coordinates"), list):
            coords = location.get("coordinates") or []
            if len(coords) >= 2:
                return float(coords[1]), float(coords[0])

        lat = location.get("lat")
        lng = location.get("lng")
        if lat is not None and lng is not None:
            return float(lat), float(lng)

    return None, None


def _distance_m(origin_lat: float, origin_lng: float, target_lat: float, target_lng: float) -> float:
    lat_diff_km = (target_lat - origin_lat) * 111
    lng_scale = cos(((origin_lat + target_lat) / 2) * (pi / 180))
    lng_diff_km = (target_lng - origin_lng) * 111 * lng_scale
    return sqrt(lat_diff_km * lat_diff_km + lng_diff_km * lng_diff_km) * 1000


def _authenticated_driver_clauses() -> list[dict[str, Any]]:
    return [
        {"is_logged_in": True},
        {
            "$and": [
                {"last_login_at": {"$exists": True}},
                {"last_login_at": {"$ne": None}},
            ]
        },
    ]


def _sorted_docs_by_distance(docs: list[dict[str, Any]], lat: float, lng: float) -> list[dict[str, Any]]:
    def distance_key(doc: dict[str, Any]) -> float:
        doc_lat, doc_lng = _extract_geo_point(doc)
        if doc_lat is None or doc_lng is None:
            return float("inf")
        return _distance_m(lat, lng, doc_lat, doc_lng)

    return sorted(docs, key=distance_key)


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
        "assigned_hospital_id": doc.get("assigned_hospital_id"),
        "assigned_hospital_name": doc.get("assigned_hospital_name"),
        "assigned_hospital_address": doc.get("assigned_hospital_address"),
        "assigned_hospital_lat": doc.get("assigned_hospital_lat"),
        "assigned_hospital_lng": doc.get("assigned_hospital_lng"),
        "assigned_driver_id": doc.get("assigned_driver_id"),
        "mirrored_emergency_id": doc.get("mirrored_emergency_id"),
        "hospital_rejected_ids": list(doc.get("hospital_rejected_ids", [])),
        "driver_rejected_ids": list(doc.get("driver_rejected_ids", [])),
        "notes": doc.get("notes", ""),
        "created_at": doc.get("created_at", datetime.now(timezone.utc)),
    }


def _load_notified_hospitals(lat: float, lng: float) -> list[dict[str, str]]:
    projection = {
        "hospital_id": 1,
        "name": 1,
        "status": 1,
        "available_beds": 1,
        "bed_capacity": 1,
        "location": 1,
    }

    query: dict[str, Any] = {
        "location": {
            "$near": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat],
                },
                "$maxDistance": MAX_NOTIFICATION_RADIUS_M,
            }
        },
        "status": {"$ne": "inactive"},
        "$or": [
            {"available_beds": {"$gt": 0}},
            {"bed_capacity": {"$gt": 0}},
        ],
    }

    selected_docs_by_id: dict[str, dict[str, Any]] = {}

    try:
        nearby_docs = list(
            get_hospitals_collection()
            .find(query, projection)
            .limit(MAX_HOSPITAL_NOTIFICATIONS)
        )
    except PyMongoError:
        nearby_docs = []

    for doc in nearby_docs:
        hospital_id = str(doc.get("hospital_id") or doc.get("_id") or "").strip()
        if hospital_id and hospital_id not in selected_docs_by_id:
            selected_docs_by_id[hospital_id] = doc

    fallback_queries: list[dict[str, Any]] = [
        {
            "status": {"$ne": "inactive"},
            "$or": [
                {"available_beds": {"$gt": 0}},
                {"bed_capacity": {"$gt": 0}},
            ],
        },
        {
            "status": {"$ne": "inactive"},
        },
    ]

    for fallback_query in fallback_queries:
        if len(selected_docs_by_id) >= MAX_HOSPITAL_NOTIFICATIONS:
            break

        try:
            fallback_docs = list(
                get_hospitals_collection()
                .find(fallback_query, projection)
                .limit(400)
            )
        except PyMongoError:
            continue

        for doc in _sorted_docs_by_distance(fallback_docs, lat, lng):
            hospital_id = str(doc.get("hospital_id") or doc.get("_id") or "").strip()
            if not hospital_id or hospital_id in selected_docs_by_id:
                continue

            selected_docs_by_id[hospital_id] = doc
            if len(selected_docs_by_id) >= MAX_HOSPITAL_NOTIFICATIONS:
                break

    hospitals: list[dict[str, str]] = []
    for doc in selected_docs_by_id.values():
        hospitals.append(
            {
                "hospital_id": _canonical_hospital_id(doc),
                "name": doc.get("name") or "Hospital",
            }
        )

        if len(hospitals) >= MAX_HOSPITAL_NOTIFICATIONS:
            break

    return hospitals


def _load_notified_drivers(lat: float, lng: float) -> list[dict[str, str | None]]:
    projection = {
        "name": 1,
        "email": 1,
        "call_sign": 1,
        "location": 1,
        "dispatch_status": 1,
        "is_logged_in": 1,
        "last_login_at": 1,
        "last_ping_at": 1,
        "updated_at": 1,
    }

    query: dict[str, Any] = {
        "location": {
            "$near": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat],
                },
                "$maxDistance": MAX_NOTIFICATION_RADIUS_M,
            }
        },
        "dispatch_status": {"$in": ["online", "available"]},
        "$or": _authenticated_driver_clauses(),
    }

    selected_docs_by_id: dict[str, dict[str, Any]] = {}

    try:
        nearby_docs = list(
            get_drivers_collection()
            .find(query, projection)
            .limit(MAX_DRIVER_NOTIFICATIONS)
        )
    except PyMongoError:
        nearby_docs = []

    for doc in nearby_docs:
        driver_id = str(doc.get("_id") or "").strip()
        if driver_id and driver_id not in selected_docs_by_id:
            selected_docs_by_id[driver_id] = doc

    if len(selected_docs_by_id) < MAX_DRIVER_NOTIFICATIONS:
        fallback_query = {
            "dispatch_status": {"$in": ["online", "available"]},
            "$or": _authenticated_driver_clauses(),
        }

        try:
            fallback_docs = list(
                get_drivers_collection()
                .find(fallback_query, projection)
                .sort([("last_ping_at", -1), ("updated_at", -1)])
                .limit(600)
            )
        except PyMongoError:
            fallback_docs = []

        sorted_fallback_docs = sorted(
            fallback_docs,
            key=lambda doc: (
                0 if str(doc.get("dispatch_status") or "").lower() in {"online", "available"} else 1,
                _distance_m(lat, lng, *_extract_geo_point(doc))
                if all(value is not None for value in _extract_geo_point(doc))
                else float("inf"),
            ),
        )

        for doc in sorted_fallback_docs:
            driver_id = str(doc.get("_id") or "").strip()
            if not driver_id or driver_id in selected_docs_by_id:
                continue

            selected_docs_by_id[driver_id] = doc
            if len(selected_docs_by_id) >= MAX_DRIVER_NOTIFICATIONS:
                break

    drivers: list[dict[str, str | None]] = []
    for doc in selected_docs_by_id.values():
        drivers.append(
            {
                "driver_id": str(doc.get("_id")),
                "name": doc.get("name") or doc.get("email") or "Driver",
                "call_sign": doc.get("call_sign"),
            }
        )

        if len(drivers) >= MAX_DRIVER_NOTIFICATIONS:
            break

    return drivers


def _get_alert_or_raise(alert_id: str) -> dict[str, Any]:
    doc = get_car_accidents_collection().find_one({"_id": _oid(alert_id)})
    if not doc:
        raise ValueError("Car accident alert not found.")
    return doc


def _resolve_driver_email(driver_id: str) -> str | None:
    normalized_driver_id = str(driver_id or "").strip()
    if not normalized_driver_id:
        return None

    if "@" in normalized_driver_id:
        return normalized_driver_id.lower()

    query: dict[str, Any]
    try:
        query = {"_id": ObjectId(normalized_driver_id)}
    except Exception:
        query = {
            "$or": [
                {"email": normalized_driver_id.lower()},
                {"email": normalized_driver_id},
                {"call_sign": normalized_driver_id},
            ]
        }

    doc = get_drivers_collection().find_one(query, {"email": 1})
    if not doc:
        return None

    email = str(doc.get("email") or "").strip().lower()
    return email or None


def _create_mirrored_emergency(payload: dict[str, Any], lat: float, lng: float) -> str:
    try:
        from .driver_service import create_driver_offers, find_nearest_drivers
        from .emergency_service import create_emergency, save_to_db
        from .hospital_service import find_nearest_hospitals, notify_hospitals
    except ImportError:  # pragma: no cover
        from services.driver_service import create_driver_offers, find_nearest_drivers
        from services.emergency_service import create_emergency, save_to_db
        from services.hospital_service import find_nearest_hospitals, notify_hospitals

    person_phone = _normalize_text(payload.get("person_phone") or "")
    crash_address = str(payload.get("address") or "").strip() or f"Crash location ({lat:.5f}, {lng:.5f})"

    emergency_doc = create_emergency(
        phone_number=person_phone,
        lat=lat,
        lng=lng,
        address=crash_address,
        emergency_type="accident",
    )
    emergency_doc["source"] = "car_accident_alert"
    emergency_doc["source_payload"] = {
        "car_name": _normalize_text(payload.get("car_name") or ""),
        "car_model": _normalize_text(payload.get("car_model") or ""),
        "person_name": _normalize_text(payload.get("person_name") or ""),
        "notes": str(payload.get("notes") or ""),
        "severity": str(payload.get("severity") or "high").strip().lower(),
    }

    emergency_id = save_to_db(emergency_doc)
    if not emergency_id:
        raise ValueError("Unable to store mirrored emergency record for this car alert.")

    hospitals = find_nearest_hospitals(lat, lng)
    notified_hospital_ids = notify_hospitals(emergency_id, hospitals)

    drivers = find_nearest_drivers(lat, lng)
    created_offers = create_driver_offers(emergency_id, drivers)

    emergency_status = "REQUESTED"
    if notified_hospital_ids:
        emergency_status = "HOSPITAL_NOTIFIED"
    if created_offers:
        emergency_status = "DRIVER_NOTIFIED"

    now = datetime.now(timezone.utc)
    update_fields: dict[str, Any] = {
        "status": emergency_status,
        "updated_at": now,
        "car_alert_sync": {
            "status": "linked",
            "linked_at": now,
        },
    }

    get_emergencies_collection().update_one(
        {"_id": _oid(emergency_id)},
        {"$set": update_fields},
    )

    return emergency_id


def _sync_mirrored_driver_acceptance(alert_doc: dict[str, Any], driver_id: str) -> None:
    mirrored_emergency_id = str(alert_doc.get("mirrored_emergency_id") or "").strip()
    if not mirrored_emergency_id:
        return

    driver_email = _resolve_driver_email(driver_id)
    if not driver_email:
        return

    try:
        from .driver_service import accept_driver_offer
    except ImportError:  # pragma: no cover
        from services.driver_service import accept_driver_offer

    emergency_doc = get_emergencies_collection().find_one(
        {"_id": _oid(mirrored_emergency_id)},
        {"driver_offers": 1, "assigned_driver_id": 1},
    )
    if not emergency_doc:
        return

    if str(emergency_doc.get("assigned_driver_id") or "").strip().lower() == driver_email:
        return

    driver_offers = emergency_doc.get("driver_offers") or []
    matching_offer = next(
        (
            offer
            for offer in driver_offers
            if str(offer.get("driver_id") or "").strip().lower() == driver_email
            and str(offer.get("status") or "").strip().lower() == "pending"
        ),
        None,
    )

    if matching_offer and matching_offer.get("offer_id"):
        accept_driver_offer(driver_email, mirrored_emergency_id, str(matching_offer.get("offer_id")))
        return

    now = datetime.now(timezone.utc)
    get_emergencies_collection().update_one(
        {
            "_id": _oid(mirrored_emergency_id),
            "assigned_driver_id": {"$in": [None, ""]},
        },
        {
            "$set": {
                "assigned_driver_id": driver_email,
                "driver_status": "assigned",
                "status": "DRIVER_ASSIGNED",
                "driver_assigned_at": now,
                "updated_at": now,
            }
        },
    )


def _sync_mirrored_driver_rejection(alert_doc: dict[str, Any], driver_id: str) -> None:
    mirrored_emergency_id = str(alert_doc.get("mirrored_emergency_id") or "").strip()
    if not mirrored_emergency_id:
        return

    driver_email = _resolve_driver_email(driver_id)
    if not driver_email:
        return

    try:
        from .driver_service import reject_driver_offer
    except ImportError:  # pragma: no cover
        from services.driver_service import reject_driver_offer

    emergency_doc = get_emergencies_collection().find_one(
        {"_id": _oid(mirrored_emergency_id)},
        {"driver_offers": 1},
    )
    if not emergency_doc:
        return

    driver_offers = emergency_doc.get("driver_offers") or []
    matching_offer = next(
        (
            offer
            for offer in driver_offers
            if str(offer.get("driver_id") or "").strip().lower() == driver_email
            and str(offer.get("status") or "").strip().lower() == "pending"
        ),
        None,
    )

    if matching_offer and matching_offer.get("offer_id"):
        reject_driver_offer(driver_email, mirrored_emergency_id, str(matching_offer.get("offer_id")))


def _sync_mirrored_hospital_acceptance(alert_doc: dict[str, Any], hospital_id: str) -> None:
    mirrored_emergency_id = str(alert_doc.get("mirrored_emergency_id") or "").strip()
    if not mirrored_emergency_id:
        return

    try:
        from .hospital_service import accept_emergency
    except ImportError:  # pragma: no cover
        from services.hospital_service import accept_emergency

    accepted = accept_emergency(hospital_id, mirrored_emergency_id)
    if accepted.get("success"):
        return

    now = datetime.now(timezone.utc)
    get_emergencies_collection().update_one(
        {
            "_id": _oid(mirrored_emergency_id),
            "assigned_hospital": {"$in": [None, ""]},
        },
        {
            "$set": {
                "assigned_hospital": hospital_id,
                "hospital_status": "accepted",
                "status": "HOSPITAL_ASSIGNED",
                "updated_at": now,
            }
        },
    )


def _sync_mirrored_hospital_rejection(alert_doc: dict[str, Any], hospital_id: str) -> None:
    mirrored_emergency_id = str(alert_doc.get("mirrored_emergency_id") or "").strip()
    if not mirrored_emergency_id:
        return

    try:
        from .hospital_service import reject_emergency
    except ImportError:  # pragma: no cover
        from services.hospital_service import reject_emergency

    rejected = reject_emergency(hospital_id, mirrored_emergency_id)
    if rejected.get("success"):
        return

    now = datetime.now(timezone.utc)
    get_emergencies_collection().update_one(
        {"_id": _oid(mirrored_emergency_id)},
        {
            "$addToSet": {"hospital_rejections": hospital_id},
            "$set": {"updated_at": now},
        },
    )


def create_car_accident_alert(payload: dict[str, Any]) -> dict[str, Any]:
    severity = str(payload.get("severity", "high")).strip().lower()
    if severity not in VALID_SEVERITIES:
        raise ValueError(
            f"Invalid severity '{severity}'. Valid values: {sorted(VALID_SEVERITIES)}"
        )

    lat = float(payload["lat"])
    lng = float(payload["lng"])

    mirrored_emergency_id = _create_mirrored_emergency(payload, lat, lng)

    hospitals = _load_notified_hospitals(lat, lng)
    drivers = _load_notified_drivers(lat, lng)

    now = datetime.now(timezone.utc)
    doc = {
        "car_name": _normalize_text(payload["car_name"]),
        "car_model": _normalize_text(payload["car_model"]),
        "person_name": _normalize_text(payload["person_name"]),
        "person_phone": _normalize_text(payload["person_phone"]),
        "location": {
            "lat": lat,
            "lng": lng,
        },
        "severity": severity,
        "status": "new",
        "airbags_activated": bool(payload.get("airbags_activated", True)),
        "notified_hospital_ids": [item["hospital_id"] for item in hospitals],
        "notified_driver_ids": [str(item["driver_id"]) for item in drivers],
        "assigned_hospital_id": None,
        "assigned_hospital_name": None,
        "assigned_hospital_address": None,
        "assigned_hospital_lat": None,
        "assigned_hospital_lng": None,
        "assigned_driver_id": None,
        "mirrored_emergency_id": mirrored_emergency_id,
        "hospital_rejected_ids": [],
        "driver_rejected_ids": [],
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


def accept_driver_for_alert(alert_id: str, driver_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    result = get_car_accidents_collection().update_one(
        {
            "_id": _oid(alert_id),
            "status": {"$in": ["new", "acknowledged"]},
            "assigned_driver_id": {"$in": [None, ""]},
            "notified_driver_ids": driver_id,
            "driver_rejected_ids": {"$ne": driver_id},
        },
        {
            "$set": {
                "assigned_driver_id": driver_id,
                "status": "acknowledged",
                "updated_at": now,
            },
            "$pull": {"driver_rejected_ids": driver_id},
        },
    )

    if result.modified_count == 0:
        doc = _get_alert_or_raise(alert_id)
        if doc.get("assigned_driver_id"):
            message = "Driver already assigned for this alert."
        elif driver_id not in doc.get("notified_driver_ids", []):
            message = "Driver was not part of the nearest notified pool."
        else:
            message = "Driver acceptance could not be processed."
        return {"message": message, "alert": _serialize_alert(doc)}

    updated = _get_alert_or_raise(alert_id)
    try:
        _sync_mirrored_driver_acceptance(updated, driver_id)
        updated = _get_alert_or_raise(alert_id)
    except Exception:
        pass

    return {
        "message": "Driver accepted the dispatch request.",
        "alert": _serialize_alert(updated),
    }


def reject_driver_for_alert(alert_id: str, driver_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    get_car_accidents_collection().update_one(
        {
            "_id": _oid(alert_id),
            "status": {"$in": ["new", "acknowledged"]},
            "assigned_driver_id": {"$in": [None, ""]},
            "notified_driver_ids": driver_id,
        },
        {
            "$addToSet": {"driver_rejected_ids": driver_id},
            "$set": {"updated_at": now},
        },
    )

    updated = _get_alert_or_raise(alert_id)
    try:
        _sync_mirrored_driver_rejection(updated, driver_id)
    except Exception:
        pass

    return {
        "message": "Driver rejection recorded.",
        "alert": _serialize_alert(updated),
    }


def accept_hospital_for_alert(alert_id: str, hospital_id: str) -> dict[str, Any]:
    hospitals_collection = get_hospitals_collection()

    hospital_matchers: list[dict[str, Any]] = [{"hospital_id": hospital_id}]
    try:
        hospital_matchers.append({"_id": _oid(hospital_id)})
    except ValueError:
        pass

    hospital_doc = hospitals_collection.find_one(
        {"$or": hospital_matchers},
        {
            "hospital_id": 1,
            "name": 1,
            "address": 1,
            "location": 1,
            "available_beds": 1,
            "bed_capacity": 1,
            "icu_available": 1,
            "icu_total": 1,
        },
    )

    if not hospital_doc:
        raise ValueError("Hospital not found for acceptance.")

    available_beds = hospital_doc.get("available_beds")
    if available_beds is None:
        available_beds = hospital_doc.get("bed_capacity", 0)

    icu_available = hospital_doc.get("icu_available")
    if icu_available is None and hospital_doc.get("icu_total") is not None:
        icu_available = hospital_doc.get("icu_total")

    if int(available_beds or 0) <= 0:
        raise ValueError("Hospital has no available beds for this alert.")

    if icu_available is not None and int(icu_available or 0) <= 0:
        raise ValueError("Hospital has no available ICU capacity for this alert.")

    hospital_lat, hospital_lng = _extract_hospital_geo(hospital_doc)

    now = datetime.now(timezone.utc)
    result = get_car_accidents_collection().update_one(
        {
            "_id": _oid(alert_id),
            "status": {"$in": ["new", "acknowledged"]},
            "assigned_hospital_id": {"$in": [None, ""]},
            "notified_hospital_ids": hospital_id,
            "hospital_rejected_ids": {"$ne": hospital_id},
        },
        {
            "$set": {
                "assigned_hospital_id": hospital_id,
                "assigned_hospital_name": hospital_doc.get("name") or hospital_id,
                "assigned_hospital_address": hospital_doc.get("address"),
                "assigned_hospital_lat": hospital_lat,
                "assigned_hospital_lng": hospital_lng,
                "status": "acknowledged",
                "updated_at": now,
            },
            "$pull": {"hospital_rejected_ids": hospital_id},
        },
    )

    if result.modified_count == 0:
        doc = _get_alert_or_raise(alert_id)
        if doc.get("assigned_hospital_id"):
            message = "Hospital already assigned for this alert."
        elif hospital_id not in doc.get("notified_hospital_ids", []):
            message = "Hospital was not part of the nearest notified pool."
        else:
            message = "Hospital acceptance could not be processed."
        return {"message": message, "alert": _serialize_alert(doc)}

    updated = _get_alert_or_raise(alert_id)
    try:
        _sync_mirrored_hospital_acceptance(updated, hospital_id)
        updated = _get_alert_or_raise(alert_id)
    except Exception:
        pass

    return {
        "message": "Hospital accepted the patient request.",
        "alert": _serialize_alert(updated),
    }


def reject_hospital_for_alert(alert_id: str, hospital_id: str) -> dict[str, Any]:
    now = datetime.now(timezone.utc)

    get_car_accidents_collection().update_one(
        {
            "_id": _oid(alert_id),
            "status": {"$in": ["new", "acknowledged"]},
            "assigned_hospital_id": {"$in": [None, ""]},
            "notified_hospital_ids": hospital_id,
        },
        {
            "$addToSet": {"hospital_rejected_ids": hospital_id},
            "$set": {"updated_at": now},
        },
    )

    updated = _get_alert_or_raise(alert_id)
    try:
        _sync_mirrored_hospital_rejection(updated, hospital_id)
    except Exception:
        pass

    return {
        "message": "Hospital rejection recorded.",
        "alert": _serialize_alert(updated),
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
    return None
