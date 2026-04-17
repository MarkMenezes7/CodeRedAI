"""
Hospital GeoJSON Migration Script
===================================
One-shot script to migrate all existing hospital documents from the legacy
location format:
    {"lat": float, "lng": float}

to GeoJSON Point format required for MongoDB 2dsphere geo-queries:
    {"type": "Point", "coordinates": [lng, lat]}

Also backfills missing `hospital_id`, `available_beds`, `status`, and
`contact` fields on legacy documents.

Usage (from the backend/ directory):
    python scripts/migrate_hospitals.py

Or as a module:
    python -m scripts.migrate_hospitals
"""
from __future__ import annotations

import logging
import random
import string
import sys
from pathlib import Path

# Ensure backend/ is on the import path when run directly
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)

_logger = logging.getLogger("migrate_hospitals")


def _generate_hospital_id() -> str:
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"HSP-{suffix}"


def run_migration() -> None:
    from database import get_hospitals_collection, migrate_hospitals_to_geojson, init_indexes_safe

    _logger.info("=" * 60)
    _logger.info("CodeRed AI — Hospital GeoJSON Migration")
    _logger.info("=" * 60)

    # Step 1: Migrate location format
    _logger.info("Step 1: Migrating location format to GeoJSON...")
    result = migrate_hospitals_to_geojson()
    _logger.info(
        "Location migration complete → migrated=%d  skipped=%d",
        result["migrated"], result["skipped"],
    )

    # Step 2: Backfill missing fields on all documents
    _logger.info("Step 2: Backfilling missing fields (hospital_id, available_beds, status, contact)...")
    collection = get_hospitals_collection()
    backfilled = 0

    for doc in collection.find({}):
        updates: dict = {}

        if not doc.get("hospital_id"):
            updates["hospital_id"] = _generate_hospital_id()

        if doc.get("available_beds") is None:
            updates["available_beds"] = 10

        if not doc.get("status"):
            updates["status"] = "active"

        if doc.get("contact") is None:
            updates["contact"] = ""

        if updates:
            collection.update_one({"_id": doc["_id"]}, {"$set": updates})
            backfilled += 1
            _logger.info(
                "  Backfilled hospital %s → %s",
                doc.get("name", str(doc["_id"])), list(updates.keys()),
            )

    _logger.info("Backfill complete → %d document(s) updated", backfilled)

    # Step 3: Ensure indexes (including 2dsphere)
    _logger.info("Step 3: Ensuring MongoDB indexes (including 2dsphere)...")
    ok = init_indexes_safe()
    if ok:
        _logger.info("Indexes verified successfully.")
    else:
        _logger.warning("Index creation failed — check Atlas connectivity.")

    _logger.info("=" * 60)
    _logger.info("Migration finished.")
    _logger.info("=" * 60)


if __name__ == "__main__":
    run_migration()
