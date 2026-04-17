"""
Emergency API — Pydantic Schemas
=================================
Request/response models for the hospital coordination endpoints.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

class CreateEmergencyRequest(BaseModel):
    phone_number: str = Field(..., description="WhatsApp number of the caller, e.g. whatsapp:+919876543210")
    lat: float = Field(..., ge=-90.0, le=90.0, description="Caller latitude")
    lng: float = Field(..., ge=-180.0, le=180.0, description="Caller longitude")
    address: str = Field(..., min_length=2, max_length=300, description="Human-readable address")
    emergency_type: str = Field(
        ...,
        description="One of: heart_attack | stroke | accident | fainting | other",
    )


class AcceptEmergencyRequest(BaseModel):
    hospital_id: str = Field(..., description="hospital_id field value, e.g. HSP-001")
    emergency_id: str = Field(..., description="MongoDB _id string of the emergency")


class RejectEmergencyRequest(BaseModel):
    hospital_id: str = Field(..., description="hospital_id field value, e.g. HSP-001")
    emergency_id: str = Field(..., description="MongoDB _id string of the emergency")


# ---------------------------------------------------------------------------
# Nested response models
# ---------------------------------------------------------------------------

class AmbulanceInfo(BaseModel):
    id: str
    driver_name: str
    contact: str
    eta: str


class NotifiedHospitalInfo(BaseModel):
    hospital_id: str
    name: str
    distance_m: Optional[float] = None


# ---------------------------------------------------------------------------
# Responses
# ---------------------------------------------------------------------------

class CreateEmergencyResponse(BaseModel):
    success: bool
    emergency_id: str
    severity: str
    notified_hospitals: List[NotifiedHospitalInfo]
    message: str


class AcceptEmergencyResponse(BaseModel):
    success: bool
    message: str
    ambulance: Optional[AmbulanceInfo] = None


class RejectEmergencyResponse(BaseModel):
    success: bool
    message: str
    fallback_triggered: bool = False
    new_notified_hospitals: List[NotifiedHospitalInfo] = []


class PendingEmergencyItem(BaseModel):
    emergency_id: str
    phone_number: str
    address: str
    emergency_type: str
    severity: str
    created_at: Optional[datetime] = None
    notified_hospitals: List[str] = []


class PendingEmergenciesResponse(BaseModel):
    success: bool
    count: int
    emergencies: List[PendingEmergencyItem]
