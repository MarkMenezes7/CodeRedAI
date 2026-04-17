from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class CreateCarAccidentRequest(BaseModel):
    car_name: str = Field(..., min_length=1, max_length=80)
    car_model: str = Field(..., min_length=1, max_length=120)
    person_name: str = Field(..., min_length=1, max_length=120)
    person_phone: str = Field(..., min_length=3, max_length=40)
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)
    severity: str = Field(default="high", description="critical | high | moderate | low")
    airbags_activated: bool = Field(default=True)
    notes: Optional[str] = Field(default=None, max_length=500)


class NotifiedHospitalInfo(BaseModel):
    hospital_id: str
    name: str


class NotifiedDriverInfo(BaseModel):
    driver_id: str
    name: str
    call_sign: Optional[str] = None


class CarAccidentAlertItem(BaseModel):
    id: str
    car_name: str
    car_model: str
    person_name: str
    person_phone: str
    lat: float
    lng: float
    severity: str
    status: str
    airbags_activated: bool
    notified_hospital_ids: List[str]
    notified_driver_ids: List[str]
    notes: str
    created_at: datetime


class CreateCarAccidentResponse(BaseModel):
    success: bool
    message: str
    alert: CarAccidentAlertItem
    notified_hospitals: List[NotifiedHospitalInfo]
    notified_drivers: List[NotifiedDriverInfo]


class ListCarAccidentsResponse(BaseModel):
    success: bool
    count: int
    alerts: List[CarAccidentAlertItem]
