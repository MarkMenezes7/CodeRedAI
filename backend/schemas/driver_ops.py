"""
Driver Operations API — Pydantic Schemas
==========================================
Request/response models for driver location, dispatch offers, and mission management.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

EMERGENCY_STATES = [
    "REQUESTED",
    "DRIVER_NOTIFIED",
    "DRIVER_ASSIGNED",
    "EN_ROUTE_PATIENT",
    "PATIENT_PICKED",
    "HOSPITAL_NOTIFIED",
    "HOSPITAL_ASSIGNED",
    "EN_ROUTE_HOSPITAL",
    "COMPLETED",
    "CANCELLED",
    "NO_RESOURCES",
]

DRIVER_OFFER_TIMEOUT_SECONDS = 30


# ---------------------------------------------------------------------------
# Requests
# ---------------------------------------------------------------------------

class DriverLocationUpdate(BaseModel):
    driver_id: str = Field(..., description="Unique driver identifier (email or driver_id)")
    lat: float = Field(..., ge=-90.0, le=90.0, description="Driver latitude")
    lng: float = Field(..., ge=-180.0, le=180.0, description="Driver longitude")
    speed_kmph: Optional[float] = Field(None, ge=0, description="Current speed in km/h")
    heading: Optional[float] = Field(None, ge=0, le=360, description="Compass heading in degrees")


class DriverOfferAction(BaseModel):
    driver_id: str = Field(..., description="Driver accepting/rejecting")
    emergency_id: str = Field(..., description="Emergency ID from the offer")
    offer_id: str = Field(..., description="Offer document ID")


class MissionStatusUpdate(BaseModel):
    driver_id: str = Field(..., description="Driver performing the update")
    emergency_id: str = Field(..., description="Emergency ID")
    status: str = Field(
        ...,
        description="New status: EN_ROUTE_PATIENT | PATIENT_PICKED | EN_ROUTE_HOSPITAL | COMPLETED",
    )
    lat: Optional[float] = Field(None, description="Current latitude")
    lng: Optional[float] = Field(None, description="Current longitude")


# ---------------------------------------------------------------------------
# Response models
# ---------------------------------------------------------------------------

class DriverOfferItem(BaseModel):
    offer_id: str
    emergency_id: str
    patient_phone: str
    patient_address: str
    patient_lat: Optional[float] = None
    patient_lng: Optional[float] = None
    emergency_type: str
    severity: str
    distance_m: Optional[float] = None
    created_at: Optional[str] = None
    expires_at: str
    assigned_hospital: Optional[str] = None


class DriverOffersResponse(BaseModel):
    success: bool
    count: int
    offers: List[DriverOfferItem]


class DriverOfferActionResponse(BaseModel):
    success: bool
    message: str
    emergency_id: Optional[str] = None
    assigned: bool = False


class ActiveMission(BaseModel):
    emergency_id: str
    status: str
    patient_phone: str
    patient_address: str
    patient_lat: Optional[float] = None
    patient_lng: Optional[float] = None
    emergency_type: str
    severity: str
    assigned_hospital_id: Optional[str] = None
    assigned_hospital_name: Optional[str] = None
    hospital_lat: Optional[float] = None
    hospital_lng: Optional[float] = None
    created_at: Optional[str] = None
    driver_assigned_at: Optional[str] = None


class ActiveMissionResponse(BaseModel):
    success: bool
    mission: Optional[ActiveMission] = None
    message: str


class LocationUpdateResponse(BaseModel):
    success: bool
    message: str


class MissionUpdateResponse(BaseModel):
    success: bool
    message: str
    new_status: str


class EmergencyStatusResponse(BaseModel):
    success: bool
    emergency_id: str
    status: str
    severity: str
    patient_address: str
    assigned_driver_id: Optional[str] = None
    assigned_hospital_id: Optional[str] = None
    ambulance_eta: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SystemMetricsResponse(BaseModel):
    success: bool
    total_emergencies: int
    active_emergencies: int
    avg_driver_response_seconds: Optional[float] = None
    avg_hospital_response_seconds: Optional[float] = None
    driver_acceptance_rate: Optional[float] = None
    hospital_acceptance_rate: Optional[float] = None
