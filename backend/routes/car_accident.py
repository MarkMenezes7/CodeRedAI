from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from pymongo.errors import PyMongoError

try:
    from ..schemas.car_accident import (
        CreateCarAccidentRequest,
        CreateCarAccidentResponse,
        ListCarAccidentsResponse,
    )
    from ..services.car_accident_service import (
        create_car_accident_alert,
        list_car_accident_alerts,
    )
except ImportError:  # pragma: no cover - compatibility for `uvicorn main:app`
    from schemas.car_accident import (
        CreateCarAccidentRequest,
        CreateCarAccidentResponse,
        ListCarAccidentsResponse,
    )
    from services.car_accident_service import (
        create_car_accident_alert,
        list_car_accident_alerts,
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
