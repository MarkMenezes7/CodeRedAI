from __future__ import annotations

import os

import certifi
from dotenv import load_dotenv
from pymongo import MongoClient
from pymongo.collection import Collection
from pymongo.database import Database

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL")
DB_NAME = os.getenv("DB_NAME", "codered_db")

if not MONGO_URL:
	raise RuntimeError("MONGO_URL is not set. Add it to backend/.env")

MONGO_URL = MONGO_URL.strip().strip('"').strip("'")

if "YOUR_PASSWORD" in MONGO_URL:
	raise RuntimeError("MONGO_URL still contains a placeholder password. Update backend/.env with your Atlas password.")

_client: MongoClient = MongoClient(
	MONGO_URL,
	tlsCAFile=certifi.where(),
	serverSelectionTimeoutMS=5000,
)
_db: Database = _client[DB_NAME]


def get_database() -> Database:
	return _db


def get_users_collection() -> Collection:
	return _db["users"]


def get_drivers_collection() -> Collection:
	return _db["drivers"]


def get_hospitals_collection() -> Collection:
	return _db["hospitals"]


def get_emergencies_collection() -> Collection:
	return _db["emergencies"]