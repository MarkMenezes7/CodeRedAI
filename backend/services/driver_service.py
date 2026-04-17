"""
Driver Service
==============
Geospatial driver discovery, dispatch offer management,
first-accept-wins assignment, and active mission tracking.

Architecture: all business logic lives here. Routes are thin wrappers.
"""
from __future__ import annotations

import logging
import random
import string
from datetime import datetime, timezone, timedelta
from typing import Any

from bson import ObjectId
from pymongo.errors import PyMongoError

try:
    from ..database import get_drivers_collection, get_emergencies_collection
except ImportError:
    from database import get_drivers_collection, get_emergencies_collection

_logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_RADIUS_M = 5_000       # 5 km initial search radius
_FALLBACK_RADIUS_M = 10_000     # 10 km fallback
_EXTENDED_RADIUS_M = 20_000     # 20 km extended fallback
_MAX_DRIVERS_TO_NOTIFY = 5      # cap notifications per emergency
_OFFER_TTL_SECONDS = 180        # configurable offer timeout


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _oid(id_str: str) -> ObjectId:
    """Convert a string ID to ObjectId, raising ValueError if malformed."""
    try:
        return ObjectId(id_str)
    except Exception as exc:
        raise ValueError(f"Invalid ID format: {id_str!r}") from exc


def _generate_offer_id() -> str:
    """Generate a unique offer ID."""
    letters = "".join(random.choices(string.ascii_uppercase, k=4))
    digits = "".join(random.choices(string.digits, k=6))
    return f"OFR-{letters}{digits}"


def _serialize_driver_docs(docs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Normalize driver documents into a consistent response shape."""
    drivers: list[dict[str, Any]] = []
    for doc in docs:
        loc = doc.get("location", {})
        coords = loc.get("coordinates", [0, 0]) if isinstance(loc, dict) else [0, 0]

        drivers.append({
            "driver_id": doc.get("email", str(doc.get("_id", ""))),
            "name": doc.get("name", "Unknown Driver"),
            "email": doc.get("email", ""),
            "phone": doc.get("phone", ""),
            "location": {"lat": coords[1], "lng": coords[0]} if len(coords) >= 2 else None,
            "speed_kmph": doc.get("speed_kmph"),
            "distance_m": None,
        })

    return drivers


def _find_fallback_available_drivers(
    limit: int,
    exclude_ids: list[str] | None,
) -> list[dict[str, Any]]:
    """
    Fallback when geo-search yields no matches.

    Returns drivers that are online/available or have no dispatch status yet,
    sorted by recent activity so a newly logged-in driver can still receive offers.
    """
    projection = {
        "email": 1,
        "name": 1,
        "phone": 1,
        "location": 1,
        "speed_kmph": 1,
        "last_ping_at": 1,
        "last_login_at": 1,
        "updated_at": 1,
        "dispatch_status": 1,
    }

    excluded = list(exclude_ids or [])
    collected_docs: list[dict[str, Any]] = []

    def fetch_docs(query: dict[str, Any], fetch_limit: int) -> list[dict[str, Any]]:
        if fetch_limit <= 0:
            return []

        final_query = dict(query)
        if excluded:
            final_query["email"] = {"$nin": excluded}

        return list(
            get_drivers_collection()
            .find(final_query, projection)
            .sort([("last_ping_at", -1), ("last_login_at", -1), ("updated_at", -1)])
            .limit(fetch_limit)
        )

    try:
        # Priority 1: explicitly online/available drivers.
        online_docs = fetch_docs({"dispatch_status": {"$in": ["online", "available"]}}, limit)
        collected_docs.extend(online_docs)
        excluded.extend([doc.get("email") for doc in online_docs if doc.get("email")])

        # Priority 2: any remaining non-assigned drivers.
        remaining = limit - len(collected_docs)
        if remaining > 0:
            fallback_docs = fetch_docs(
                {
                    "$or": [
                        {"dispatch_status": {"$nin": ["assigned", "on_mission"]}},
                        {"dispatch_status": {"$exists": False}},
                    ]
                },
                remaining,
            )
            collected_docs.extend(fallback_docs)
    except PyMongoError as exc:
        _logger.error("[DRIVER FALLBACK QUERY ERROR] %s", exc)
        return []

    drivers = _serialize_driver_docs(collected_docs)
    _logger.info("[DRIVER FALLBACK] selected %d driver(s) without geo constraint", len(drivers))
    return drivers


# ---------------------------------------------------------------------------
# Driver Location Management
# ---------------------------------------------------------------------------

def update_driver_location(
    driver_id: str,
    lat: float,
    lng: float,
    speed_kmph: float | None = None,
    heading: float | None = None,
) -> bool:
    """
    Upsert the driver's live GPS location in GeoJSON format.
    Also sets dispatch_status to 'online' and refreshes last_ping_at.

    Returns True on success, False on DB failure.
    """
    collection = get_drivers_collection()

    update_fields: dict[str, Any] = {
        "location": {
            "type": "Point",
            "coordinates": [lng, lat],  # GeoJSON order: [lng, lat]
        },
        "last_ping_at": datetime.now(tz=timezone.utc),
        "updated_at": datetime.now(tz=timezone.utc),
    }

    # Only set to online if not currently on a mission
    # (dispatch_status "assigned" should not be overwritten)
    update_on_insert = {
        "dispatch_status": "online",
    }

    if speed_kmph is not None:
        update_fields["speed_kmph"] = speed_kmph
    if heading is not None:
        update_fields["heading"] = heading

    try:
        result = collection.update_one(
            {"email": driver_id},
            {
                "$set": update_fields,
                "$setOnInsert": update_on_insert,
            },
            upsert=True,  # Crucial: create the driver doc if they don't exist yet
        )

        # If the driver exists and is not assigned, set them to online
        if result.matched_count > 0:
            collection.update_one(
                {
                    "email": driver_id,
                    "dispatch_status": {"$nin": ["assigned", "on_mission"]},
                },
                {"$set": {"dispatch_status": "online"}},
            )

        _logger.debug(
            "[DRIVER LOCATION] %s → (%.4f, %.4f) speed=%.1f",
            driver_id, lat, lng, speed_kmph or 0,
        )
        return True

    except PyMongoError as exc:
        _logger.error("[DRIVER LOCATION ERROR] %s: %s", driver_id, exc)
        return False


# ---------------------------------------------------------------------------
# Geospatial Driver Discovery
# ---------------------------------------------------------------------------

def find_nearest_drivers(
    lat: float,
    lng: float,
    radius_m: int = _DEFAULT_RADIUS_M,
    limit: int = _MAX_DRIVERS_TO_NOTIFY,
    exclude_ids: list[str] | None = None,
) -> list[dict[str, Any]]:
    """
    Find the nearest online drivers using MongoDB's $near geospatial operator.
    Requires a 2dsphere index on drivers.location.

    If no geo-qualified drivers are found, falls back to recently active
    online/available drivers so dispatch can still proceed.

    Parameters
    ----------
    lat, lng : float
        Patient/emergency GPS coordinates.
    radius_m : int
        Search radius in metres.
    limit : int
        Maximum number of drivers to return.
    exclude_ids : list[str] | None
        Driver IDs (emails) to exclude (already rejected/notified).

    Returns
    -------
    list of driver dicts with keys: driver_id, name, email, distance_m, location.
    """
    collection = get_drivers_collection()

    # Only find drivers who are online and have a GeoJSON location
    query: dict[str, Any] = {
        "location": {
            "$near": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat],
                },
                "$maxDistance": radius_m,
            }
        },
        "dispatch_status": "online",
    }

    if exclude_ids:
        query["email"] = {"$nin": exclude_ids}

    try:
        docs = list(collection.find(query).limit(limit))
    except PyMongoError as exc:
        _logger.error("[DRIVER GEO SEARCH ERROR] %s", exc)
        docs = []

    drivers = _serialize_driver_docs(docs)

    selected_ids = [driver.get("driver_id") for driver in drivers if driver.get("driver_id")]
    excluded_ids = [*(exclude_ids or []), *selected_ids]

    if len(drivers) < limit:
        supplemental = _find_fallback_available_drivers(
            limit=limit - len(drivers),
            exclude_ids=excluded_ids,
        )
        drivers.extend(supplemental)

    _logger.info(
        "[DRIVER GEO SEARCH] lat=%.4f lng=%.4f radius=%dm → found %d driver(s)",
        lat, lng, radius_m, len(drivers),
    )
    for d in drivers:
        _logger.info("  ↳ %s | %s", d["driver_id"], d["name"])

    return drivers


# ---------------------------------------------------------------------------
# Dispatch Offer Management
# ---------------------------------------------------------------------------

def create_driver_offers(
    emergency_id: str,
    drivers: list[dict[str, Any]],
    ttl_seconds: int = _OFFER_TTL_SECONDS,
) -> list[dict[str, Any]]:
    """
    Create dispatch offers for the given drivers and store them on the
    emergency document in MongoDB.

    Each offer has a unique ID and an expiration timestamp.

    Returns the list of created offer dicts.
    """
    if not drivers:
        _logger.warning("[OFFERS] No drivers to create offers for emergency=%s", emergency_id)
        return []

    now = datetime.now(tz=timezone.utc)
    expires_at = now + timedelta(seconds=ttl_seconds)

    offers = []
    for driver in drivers:
        offer = {
            "offer_id": _generate_offer_id(),
            "driver_id": driver["driver_id"],
            "driver_name": driver["name"],
            "status": "pending",
            "created_at": now.isoformat(),
            "expires_at": expires_at.isoformat(),
        }
        offers.append(offer)

    try:
        get_emergencies_collection().update_one(
            {"_id": _oid(emergency_id)},
            {
                "$set": {
                    "driver_offers": offers,
                    "driver_status": "offers_pending",
                    "updated_at": now,
                },
            },
        )
    except PyMongoError as exc:
        _logger.error("[OFFERS DB ERROR] %s", exc)
        return []

    _logger.info(
        "[OFFERS] Created %d offer(s) for emergency=%s (TTL=%ds)",
        len(offers), emergency_id, ttl_seconds,
    )
    for o in offers:
        _logger.info("  📡 Offer %s → driver %s", o["offer_id"], o["driver_id"])

    return offers


def get_pending_offers_for_driver(driver_id: str) -> list[dict[str, Any]]:
    """
    Find all emergencies with a pending offer for this driver that haven't expired.

    Returns a list of dicts with emergency + offer details merged.
    """
    now = datetime.now(tz=timezone.utc).isoformat()

    try:
        docs = list(
            get_emergencies_collection().find(
                {
                    "driver_offers": {
                        "$elemMatch": {
                            "driver_id": driver_id,
                            "status": "pending",
                        }
                    },
                    "status": {
                        "$in": ["REQUESTED", "DRIVER_NOTIFIED", "HOSPITAL_NOTIFIED", "HOSPITAL_ASSIGNED"]
                    },
                }
            ).sort("created_at", -1).limit(10)
        )
    except PyMongoError as exc:
        _logger.error("[OFFERS QUERY ERROR] %s", exc)
        return []

    results = []
    for doc in docs:
        offers = doc.get("driver_offers", [])
        for offer in offers:
            if offer.get("driver_id") != driver_id or offer.get("status") != "pending":
                continue

            # Check if expired
            if offer.get("expires_at", "") < now:
                continue

            loc = doc.get("location", {})
            results.append({
                "offer_id": offer["offer_id"],
                "emergency_id": str(doc["_id"]),
                "patient_phone": doc.get("phone_number", ""),
                "patient_address": loc.get("address", ""),
                "patient_lat": loc.get("lat"),
                "patient_lng": loc.get("lng"),
                "emergency_type": doc.get("emergency_type", ""),
                "severity": doc.get("severity", ""),
                "created_at": doc.get("created_at", ""),
                "expires_at": offer["expires_at"],
                "assigned_hospital": doc.get("assigned_hospital"),
            })

    _logger.info("[OFFERS] driver=%s has %d pending offer(s)", driver_id, len(results))
    return results


# ---------------------------------------------------------------------------
# First-Accept-Wins Driver Assignment
# ---------------------------------------------------------------------------

def accept_driver_offer(
    driver_id: str,
    emergency_id: str,
    offer_id: str,
) -> dict[str, Any]:
    """
    Atomically assign this driver to the emergency.

    The update only succeeds if driver_status is still 'offers_pending',
    ensuring exactly one driver wins the race.

    Returns dict with keys: assigned (bool), message (str).
    """
    now = datetime.now(tz=timezone.utc)

    try:
        # Atomic update: only succeed if no driver already assigned
        result = get_emergencies_collection().update_one(
            {
                "_id": _oid(emergency_id),
                "driver_status": "offers_pending",
                "driver_offers.offer_id": offer_id,
                "driver_offers.driver_id": driver_id,
                "driver_offers.status": "pending",
            },
            {
                "$set": {
                    "assigned_driver_id": driver_id,
                    "driver_status": "assigned",
                    "status": "DRIVER_ASSIGNED",
                    "driver_assigned_at": now,
                    "updated_at": now,
                    "driver_offers.$[matched].status": "accepted",
                },
            },
            array_filters=[{"matched.offer_id": offer_id}],
        )
    except PyMongoError as exc:
        _logger.error("[DRIVER ACCEPT ERROR] %s", exc)
        raise

    if result.matched_count == 0:
        _logger.warning(
            "[DRIVER ACCEPT LOST] driver=%s emergency=%s — race lost or expired",
            driver_id, emergency_id,
        )
        return {
            "assigned": False,
            "message": "Offer expired or another driver was already assigned.",
        }

    # Mark the driver as assigned in the drivers collection
    try:
        get_drivers_collection().update_one(
            {"email": driver_id},
            {
                "$set": {
                    "dispatch_status": "assigned",
                    "current_emergency_id": emergency_id,
                    "updated_at": now,
                }
            },
        )
    except PyMongoError as exc:
        _logger.error("[DRIVER STATUS UPDATE ERROR] %s", exc)

    # Cancel all other pending offers for this emergency
    try:
        get_emergencies_collection().update_one(
            {"_id": _oid(emergency_id)},
            {
                "$set": {
                    "driver_offers.$[other].status": "cancelled",
                }
            },
            array_filters=[{
                "other.offer_id": {"$ne": offer_id},
                "other.status": "pending",
            }],
        )
    except PyMongoError:
        pass  # Non-critical — just cleanup

    _logger.info(
        "[DRIVER ACCEPT WON] driver=%s emergency=%s offer=%s",
        driver_id, emergency_id, offer_id,
    )
    return {
        "assigned": True,
        "message": "You have been assigned to this emergency. Navigate to the patient now.",
    }


def reject_driver_offer(
    driver_id: str,
    emergency_id: str,
    offer_id: str,
) -> dict[str, Any]:
    """
    Record this driver's rejection. If all offers are now rejected/expired,
    expand the search radius and create new offers.
    """
    now = datetime.now(tz=timezone.utc)

    try:
        get_emergencies_collection().update_one(
            {
                "_id": _oid(emergency_id),
                "driver_offers.offer_id": offer_id,
            },
            {
                "$set": {
                    "driver_offers.$[matched].status": "rejected",
                    "updated_at": now,
                }
            },
            array_filters=[{"matched.offer_id": offer_id}],
        )
    except PyMongoError as exc:
        _logger.error("[DRIVER REJECT ERROR] %s", exc)
        raise

    _logger.info("[DRIVER REJECT] driver=%s emergency=%s", driver_id, emergency_id)

    # Check if all offers are now resolved (rejected or expired)
    try:
        doc = get_emergencies_collection().find_one({"_id": _oid(emergency_id)})
    except PyMongoError:
        return {"message": "Rejection recorded.", "fallback_triggered": False}

    if not doc:
        return {"message": "Emergency not found.", "fallback_triggered": False}

    offers = doc.get("driver_offers", [])
    still_pending = [
        o for o in offers
        if o.get("status") == "pending" and o.get("expires_at", "") >= now.isoformat()
    ]

    if still_pending:
        return {
            "message": f"Rejection recorded. {len(still_pending)} driver(s) still pending.",
            "fallback_triggered": False,
        }

    # All offers exhausted — try fallback radius
    rejected_ids = [o["driver_id"] for o in offers]
    loc = doc.get("location", {})
    lat = loc.get("lat")
    lng = loc.get("lng")

    if lat is None or lng is None:
        return {
            "message": "All drivers rejected. No coordinates for fallback.",
            "fallback_triggered": False,
        }

    _logger.warning(
        "[DRIVER FALLBACK] All offers rejected for emergency=%s — expanding to %dm",
        emergency_id, _FALLBACK_RADIUS_M,
    )

    new_drivers = find_nearest_drivers(
        lat, lng,
        radius_m=_FALLBACK_RADIUS_M,
        limit=_MAX_DRIVERS_TO_NOTIFY,
        exclude_ids=rejected_ids,
    )

    if not new_drivers:
        # Try extended radius
        new_drivers = find_nearest_drivers(
            lat, lng,
            radius_m=_EXTENDED_RADIUS_M,
            limit=_MAX_DRIVERS_TO_NOTIFY,
            exclude_ids=rejected_ids,
        )

    if not new_drivers:
        _logger.error("[DRIVER FALLBACK] No drivers found even at %dm", _EXTENDED_RADIUS_M)
        get_emergencies_collection().update_one(
            {"_id": _oid(emergency_id)},
            {"$set": {"driver_status": "no_drivers", "updated_at": now}},
        )
        return {
            "message": "All drivers rejected. No additional drivers available within 20 km.",
            "fallback_triggered": False,
        }

    new_offers = create_driver_offers(emergency_id, new_drivers)
    return {
        "message": f"Fallback triggered — {len(new_offers)} new driver(s) notified within expanded radius.",
        "fallback_triggered": True,
    }


# ---------------------------------------------------------------------------
# Active Mission Management
# ---------------------------------------------------------------------------

def get_active_mission(driver_id: str) -> dict[str, Any] | None:
    """
    Get the currently active emergency mission for a driver.
    Returns the full emergency document if the driver is assigned, else None.
    """
    try:
        doc = get_emergencies_collection().find_one({
            "assigned_driver_id": driver_id,
            "status": {
                "$in": [
                    "DRIVER_ASSIGNED",
                    "EN_ROUTE_PATIENT",
                    "PATIENT_PICKED",
                    "HOSPITAL_ASSIGNED",
                    "EN_ROUTE_HOSPITAL",
                ]
            },
        })
    except PyMongoError as exc:
        _logger.error("[ACTIVE MISSION ERROR] %s", exc)
        return None

    if not doc:
        return None

    loc = doc.get("location", {})

    mission: dict[str, Any] = {
        "emergency_id": str(doc["_id"]),
        "status": doc.get("status", ""),
        "patient_phone": doc.get("phone_number", ""),
        "patient_address": loc.get("address", ""),
        "patient_lat": loc.get("lat"),
        "patient_lng": loc.get("lng"),
        "emergency_type": doc.get("emergency_type", ""),
        "severity": doc.get("severity", ""),
        "assigned_hospital_id": doc.get("assigned_hospital"),
        "created_at": doc.get("created_at"),
        "driver_assigned_at": doc.get("driver_assigned_at"),
    }

    # If a hospital is assigned, fetch its details
    if mission["assigned_hospital_id"]:
        try:
            from database import get_hospitals_collection
            hospital = get_hospitals_collection().find_one(
                {"hospital_id": mission["assigned_hospital_id"]}
            )
            if hospital:
                mission["assigned_hospital_name"] = hospital.get("name", "")
                h_loc = hospital.get("location", {})
                if isinstance(h_loc, dict) and h_loc.get("type") == "Point":
                    coords = h_loc.get("coordinates", [])
                    if len(coords) >= 2:
                        mission["hospital_lng"] = coords[0]
                        mission["hospital_lat"] = coords[1]
        except Exception:
            pass  # Non-critical

    return mission


def update_mission_status(
    driver_id: str,
    emergency_id: str,
    new_status: str,
    lat: float | None = None,
    lng: float | None = None,
) -> dict[str, Any]:
    """
    Transition the emergency status as the driver progresses through the mission.

    Valid transitions:
        DRIVER_ASSIGNED → EN_ROUTE_PATIENT
        EN_ROUTE_PATIENT → PATIENT_PICKED
        PATIENT_PICKED → EN_ROUTE_HOSPITAL
        EN_ROUTE_HOSPITAL → COMPLETED
    """
    valid_transitions = {
        "EN_ROUTE_PATIENT": ["DRIVER_ASSIGNED"],
        "PATIENT_PICKED": ["EN_ROUTE_PATIENT"],
        "EN_ROUTE_HOSPITAL": ["PATIENT_PICKED", "HOSPITAL_ASSIGNED"],
        "COMPLETED": ["EN_ROUTE_HOSPITAL"],
    }

    allowed_from = valid_transitions.get(new_status)
    if not allowed_from:
        return {"success": False, "message": f"Invalid status transition target: {new_status}"}

    now = datetime.now(tz=timezone.utc)

    update_fields: dict[str, Any] = {
        "status": new_status,
        "updated_at": now,
    }

    if new_status == "COMPLETED":
        update_fields["completed_at"] = now

    try:
        result = get_emergencies_collection().update_one(
            {
                "_id": _oid(emergency_id),
                "assigned_driver_id": driver_id,
                "status": {"$in": allowed_from},
            },
            {"$set": update_fields},
        )
    except PyMongoError as exc:
        _logger.error("[MISSION UPDATE ERROR] %s", exc)
        return {"success": False, "message": f"Database error: {exc}"}

    if result.matched_count == 0:
        return {
            "success": False,
            "message": f"Cannot transition to {new_status}. Current status may not allow this transition.",
        }

    # If completed, free the driver
    if new_status == "COMPLETED":
        try:
            get_drivers_collection().update_one(
                {"email": driver_id},
                {
                    "$set": {
                        "dispatch_status": "online",
                        "current_emergency_id": None,
                        "updated_at": now,
                    }
                },
            )
        except PyMongoError:
            pass

    _logger.info(
        "[MISSION UPDATE] driver=%s emergency=%s → %s",
        driver_id, emergency_id, new_status,
    )
    return {"success": True, "message": f"Status updated to {new_status}."}
