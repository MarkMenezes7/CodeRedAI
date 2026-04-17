from __future__ import annotations

import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request, Response, status
from jose import JWTError, jwt

_ENV_PATH = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(dotenv_path=_ENV_PATH)

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise RuntimeError("JWT_SECRET is not set. Add it to backend/.env")

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")


def _get_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _is_truthy(value: Optional[str]) -> bool:
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


ACCESS_TOKEN_EXPIRE_DAYS = _get_int_env("JWT_EXPIRE_DAYS", 7)
COOKIE_NAME = os.getenv("AUTH_COOKIE_NAME", "codered_access_token")
COOKIE_DOMAIN = os.getenv("AUTH_COOKIE_DOMAIN")
COOKIE_SECURE = _is_truthy(os.getenv("AUTH_COOKIE_SECURE", "false"))


def create_access_token(payload: Dict[str, Any], expires_delta: Optional[timedelta] = None) -> str:
    to_encode = payload.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc


def set_access_cookie(response: Response, token: str) -> None:
    max_age = ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60
    cookie_args = {
        "key": COOKIE_NAME,
        "value": token,
        "httponly": True,
        "secure": COOKIE_SECURE,
        "samesite": "lax",
        "max_age": max_age,
        "path": "/",
    }
    if COOKIE_DOMAIN:
        cookie_args["domain"] = COOKIE_DOMAIN
    response.set_cookie(**cookie_args)


def get_token_from_request(request: Request) -> Optional[str]:
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip() or None

    if COOKIE_NAME in request.cookies:
        return request.cookies.get(COOKIE_NAME)

    return None


def get_current_user(request: Request) -> Dict[str, Any]:
    token = get_token_from_request(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token.",
        )

    payload = decode_access_token(token)
    user_id = payload.get("sub")
    role = payload.get("role")

    if not user_id or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication payload.",
        )

    return {
        "id": str(user_id),
        "role": role,
        "email": payload.get("email"),
        "name": payload.get("name"),
    }


def require_role(allowed_roles: list[str]):
    def _role_guard(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
        if user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions.",
            )
        return user

    return _role_guard
