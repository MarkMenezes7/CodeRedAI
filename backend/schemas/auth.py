from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=5, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)


class SignupGeoPoint(BaseModel):
    lat: float
    lng: float


class HospitalSignupRequest(BaseModel):
    hospitalId: str = Field(..., min_length=4, max_length=30)
    email: str = Field(..., min_length=5, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)
    bedCapacity: int = Field(..., ge=1, le=5000)
    location: SignupGeoPoint


class DriverSignupRequest(BaseModel):
    driverName: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)
    phone: str = Field(..., min_length=7, max_length=20)
    vehicleNumber: str = Field(..., min_length=4, max_length=20)
    linkedHospitalId: str = Field(..., min_length=4, max_length=30)


class AdminSignupRequest(BaseModel):
    adminName: str = Field(..., min_length=2, max_length=120)
    email: str = Field(..., min_length=5, max_length=320)
    password: str = Field(..., min_length=8, max_length=128)


class GeoPoint(BaseModel):
    lat: float
    lng: float


class HospitalAuthUser(BaseModel):
    id: str
    name: str
    email: str
    hospitalId: Optional[str] = None
    bedCapacity: Optional[int] = None
    address: Optional[str] = None
    location: Optional[GeoPoint] = None


class DriverAuthUser(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None
    callSign: Optional[str] = None
    vehicleNumber: Optional[str] = None
    linkedHospitalId: Optional[str] = None


class AdminAuthUser(BaseModel):
    id: str
    name: str
    email: str
    role: str


class HospitalAuthResponse(BaseModel):
    success: bool
    message: str
    token: str
    user: HospitalAuthUser


class DriverAuthResponse(BaseModel):
    success: bool
    message: str
    token: str
    user: DriverAuthUser


class AdminAuthResponse(BaseModel):
    success: bool
    message: str
    token: str
    user: AdminAuthUser


class PresetHospitalAccount(BaseModel):
    id: str
    name: str
    email: str


class PresetHospitalResponse(BaseModel):
    defaultPassword: str
    hospitals: List[PresetHospitalAccount]


class PresetDriverAccount(BaseModel):
    id: str
    name: str
    email: str
    callSign: Optional[str] = None


class PresetDriverResponse(BaseModel):
    defaultPassword: str
    drivers: List[PresetDriverAccount]
