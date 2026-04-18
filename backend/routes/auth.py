from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

try:
    from ..schemas.auth import (
        AdminAuthResponse,
        AdminSignupRequest,
        DriverAuthResponse,
        DriverSignupRequest,
        HospitalAuthResponse,
        HospitalSignupRequest,
        LoginRequest,
        PresetDriverResponse,
        PresetHospitalResponse,
    )
    from ..services.auth_service import (
        get_preset_drivers,
        get_hospital_profile,
        get_preset_hospitals,
        login_admin,
        login_driver,
        login_hospital,
        signup_admin,
        signup_driver,
        signup_hospital,
        update_hospital_profile,
    )
    from ..utils.jwt_handler import set_access_cookie
except ImportError:  # pragma: no cover - compatibility for `uvicorn app.main:app`
    from schemas.auth import (
        AdminAuthResponse,
        AdminSignupRequest,
        DriverAuthResponse,
        DriverSignupRequest,
        HospitalAuthResponse,
        HospitalSignupRequest,
        LoginRequest,
        PresetDriverResponse,
        PresetHospitalResponse,
    )
    from services.auth_service import (
        get_preset_drivers,
        get_hospital_profile,
        get_preset_hospitals,
        login_admin,
        login_driver,
        login_hospital,
        signup_admin,
        signup_driver,
        signup_hospital,
        update_hospital_profile,
    )
    from utils.jwt_handler import set_access_cookie

router = APIRouter()


@router.post("/hospital/signup", response_model=HospitalAuthResponse, status_code=status.HTTP_201_CREATED)
async def hospital_signup(payload: HospitalSignupRequest, response: Response):
    result = signup_hospital(payload)
    set_access_cookie(response, result.token)
    return {
        "success": True,
        "message": "Hospital account created.",
        "token": result.token,
        "user": result.user,
    }


@router.post("/hospital/login", response_model=HospitalAuthResponse)
async def hospital_login(payload: LoginRequest, response: Response):
    result = login_hospital(payload)
    set_access_cookie(response, result.token)
    return {
        "success": True,
        "message": "Login successful.",
        "token": result.token,
        "user": result.user,
    }


@router.get("/hospital/presets", response_model=PresetHospitalResponse)
async def hospital_presets(
    limit: int = Query(default=200, ge=1, le=500, description="Maximum number of hospital presets to return."),
):
    return get_preset_hospitals(limit=limit)


@router.get("/hospital/profile")
async def hospital_profile_get(
    hospital_id: str = Query(..., description="Hospital identifier (hospital_id, email, name, or _id)."),
):
    profile = get_hospital_profile(hospital_id)
    if not profile:
        return {"success": False, "message": "Hospital not found."}
    return {"success": True, **profile}


@router.put("/hospital/profile")
async def hospital_profile_update(payload: dict):
    hospital_id = payload.get("hospital_id")
    if not hospital_id:
        return {"success": False, "message": "hospital_id is required."}

    result = update_hospital_profile(
        hospital_id=hospital_id,
        name=payload.get("name"),
        email=payload.get("email"),
        address=payload.get("address"),
        bed_capacity=payload.get("bed_capacity", payload.get("bedCapacity")),
        location=payload.get("location"),
    )
    return result


@router.post("/driver/signup", response_model=DriverAuthResponse, status_code=status.HTTP_201_CREATED)
async def driver_signup(payload: DriverSignupRequest, response: Response):
    result = signup_driver(payload)
    set_access_cookie(response, result.token)
    return {
        "success": True,
        "message": "Driver account created.",
        "token": result.token,
        "user": result.user,
    }


@router.post("/driver/login", response_model=DriverAuthResponse)
async def driver_login(payload: LoginRequest, response: Response):
    result = login_driver(payload)
    set_access_cookie(response, result.token)
    return {
        "success": True,
        "message": "Login successful.",
        "token": result.token,
        "user": result.user,
    }


@router.get("/driver/presets", response_model=PresetDriverResponse)
async def driver_presets(
    hospitalId: str | None = Query(default=None, description="Filter by linked hospital ID."),
    availableOnly: bool = Query(default=False, description="Return dashboard-ready non-assigned drivers."),
):
    return get_preset_drivers(linked_hospital_id=hospitalId, available_only=availableOnly)


@router.post("/admin/signup", response_model=AdminAuthResponse, status_code=status.HTTP_201_CREATED)
async def admin_signup(payload: AdminSignupRequest, response: Response):
    result = signup_admin(payload)
    set_access_cookie(response, result.token)
    return {
        "success": True,
        "message": "Admin account created.",
        "token": result.token,
        "user": result.user,
    }


@router.post("/admin/login", response_model=AdminAuthResponse)
async def admin_login(payload: LoginRequest, response: Response):
    result = login_admin(payload)
    set_access_cookie(response, result.token)
    return {
        "success": True,
        "message": "Login successful.",
        "token": result.token,
        "user": result.user,
    }
