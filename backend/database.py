from __future__ import annotations

import logging
import os
from pathlib import Path

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database
from pymongo.errors import PyMongoError

_ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "codered_db")

if not MONGO_URL:
    raise RuntimeError("MONGO_URL is not set. Add it to backend/.env")

MONGO_URL = MONGO_URL.strip().strip('"').strip("'")

if "YOUR_PASSWORD" in MONGO_URL:
    raise RuntimeError(
        "MONGO_URL still contains a placeholder password. Update backend/.env with your Atlas password."
    )

_client: MongoClient = MongoClient(
    MONGO_URL,
    tlsCAFile=certifi.where(),
    serverSelectionTimeoutMS=5000,
)
_db: Database = _client[DB_NAME]
_logger = logging.getLogger(__name__)


def get_database() -> Database:
    return _db


def get_hospitals_collection() -> Collection:
    return _db["hospitals"]


def get_drivers_collection() -> Collection:
    return _db["drivers"]


def get_admins_collection() -> Collection:
    return _db["admins"]


def verify_database_connection() -> None:
    _client.admin.command("ping")


def init_indexes() -> None:
    get_hospitals_collection().create_index("email", unique=True)
    get_drivers_collection().create_index("email", unique=True)
    get_admins_collection().create_index("email", unique=True)


def init_indexes_safe() -> bool:
    try:
        verify_database_connection()
        init_indexes()
        return True
    except PyMongoError as exc:
        _logger.warning(
            "MongoDB startup check failed: %s. Continuing without DB startup tasks. "
            "If using Atlas, verify Network Access allowlist and outbound TLS.",
            exc,
        )
        return False
