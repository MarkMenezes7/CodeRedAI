from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from pymongo.errors import PyMongoError

try:
    from ..schemas.car_accident import (
        CarAccidentActionResponse,
        CreateCarAccidentRequest,
        CreateCarAccidentResponse,
        DriverOfferActionRequest,
        HospitalOfferActionRequest,
        ListCarAccidentsResponse,
    )
    from ..services.car_accident_service import (
        accept_driver_for_alert,
        accept_hospital_for_alert,
        create_car_accident_alert,
        list_car_accident_alerts,
        reject_driver_for_alert,
        reject_hospital_for_alert,
    )
except ImportError:  # pragma: no cover - compatibility for `uvicorn main:app`
    from schemas.car_accident import (
        CarAccidentActionResponse,
        CreateCarAccidentRequest,
        CreateCarAccidentResponse,
        DriverOfferActionRequest,
        HospitalOfferActionRequest,
        ListCarAccidentsResponse,
    )
    from services.car_accident_service import (
        accept_driver_for_alert,
        accept_hospital_for_alert,
        create_car_accident_alert,
        list_car_accident_alerts,
        reject_driver_for_alert,
        reject_hospital_for_alert,
    )

router = APIRouter()


@router.post(
    "/car-accidents",
    response_model=CreateCarAccidentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_car_accident_endpoint(payload: CreateCarAccidentRequest):
    try:
        created = create_car_accident_alert(payload.dict())
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Could not create car accident alert.",
        ) from exc

    alert = created["alert"]
    hospitals = created["notified_hospitals"]
    drivers = created["notified_drivers"]

    return {
        "success": True,
        "message": (
            f"Car accident alert created. "
            f"{len(hospitals)} hospital(s) and {len(drivers)} driver(s) notified."
        ),
        "alert": alert,
        "notified_hospitals": hospitals,
        "notified_drivers": drivers,
    }


@router.get("/car-accidents", response_model=ListCarAccidentsResponse)
async def list_car_accidents_endpoint(
    limit: int = Query(default=30, ge=1, le=200),
):
    try:
        alerts = list_car_accident_alerts(limit=limit)
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Could not load car accident alerts.",
        ) from exc

    return {
        "success": True,
        "count": len(alerts),
        "alerts": alerts,
    }


@router.post("/car-accidents/{alert_id}/driver/accept", response_model=CarAccidentActionResponse)
async def accept_driver_claim_endpoint(alert_id: str, payload: DriverOfferActionRequest):
    try:
        result = accept_driver_for_alert(alert_id=alert_id, driver_id=payload.driver_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Could not accept driver claim.",
        ) from exc

    return {
        "success": True,
        "message": result["message"],
        "alert": result["alert"],
    }


@router.post("/car-accidents/{alert_id}/driver/reject", response_model=CarAccidentActionResponse)
async def reject_driver_claim_endpoint(alert_id: str, payload: DriverOfferActionRequest):
    try:
        result = reject_driver_for_alert(alert_id=alert_id, driver_id=payload.driver_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Could not reject driver claim.",
        ) from exc

    return {
        "success": True,
        "message": result["message"],
        "alert": result["alert"],
    }


@router.post("/car-accidents/{alert_id}/hospital/accept", response_model=CarAccidentActionResponse)
async def accept_hospital_claim_endpoint(alert_id: str, payload: HospitalOfferActionRequest):
    try:
        result = accept_hospital_for_alert(alert_id=alert_id, hospital_id=payload.hospital_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Could not accept hospital claim.",
        ) from exc

    return {
        "success": True,
        "message": result["message"],
        "alert": result["alert"],
    }


@router.post("/car-accidents/{alert_id}/hospital/reject", response_model=CarAccidentActionResponse)
async def reject_hospital_claim_endpoint(alert_id: str, payload: HospitalOfferActionRequest):
    try:
        result = reject_hospital_for_alert(alert_id=alert_id, hospital_id=payload.hospital_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    except PyMongoError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable. Could not reject hospital claim.",
        ) from exc

    return {
        "success": True,
        "message": result["message"],
        "alert": result["alert"],
    }
