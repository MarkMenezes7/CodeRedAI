from __future__ import annotations

import bcrypt

_ENCODING = "utf-8"


def hash_password(password: str) -> str:
    """Hash a plain-text password using bcrypt and return the hash as a str."""
    hashed = bcrypt.hashpw(password.encode(_ENCODING), bcrypt.gensalt())
    return hashed.decode(_ENCODING)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Return True if plain_password matches the stored bcrypt hash."""
    try:
        return bcrypt.checkpw(plain_password.encode(_ENCODING), hashed_password.encode(_ENCODING))
    except Exception:  # noqa: BLE001 - treat any bcrypt error as a failed verify
        return False
