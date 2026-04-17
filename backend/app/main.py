from __future__ import annotations

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_indexes_safe
from routes.auth import router as auth_router
from services.auth_service import seed_default_admins

_logger = logging.getLogger(__name__)


def _get_cors_origins() -> list[str]:
    raw = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]


def create_app() -> FastAPI:
    app = FastAPI(title="CodeRed AI API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_get_cors_origins(),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router, prefix="/api", tags=["auth"])

    @app.on_event("startup")
    def _startup() -> None:
        db_ready = init_indexes_safe()
        if db_ready:
            seed_default_admins()
        else:
            _logger.warning("Skipping admin seeding because MongoDB is unavailable.")

    return app


app = create_app()


@app.get("/")
async def home() -> dict:
    return {"status": "ok", "message": "CodeRed Backend Running"}