from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class GeoPoint:
    lat: float
    lng: float


@dataclass
class HospitalRecord:
    id: str
    name: str
    email: str
    password_hash: str
    role: str
    created_at: datetime
    updated_at: datetime
    address: Optional[str] = None
    location: Optional[GeoPoint] = None


@dataclass
class DriverRecord:
    id: str
    name: str
    email: str
    password_hash: str
    role: str
    created_at: datetime
    updated_at: datetime
    phone: Optional[str] = None
    call_sign: Optional[str] = None
    vehicle_number: Optional[str] = None
    linked_hospital_id: Optional[str] = None


@dataclass
class AdminRecord:
    id: str
    name: str
    email: str
    password_hash: str
    role: str
    created_at: datetime
    updated_at: datetime
