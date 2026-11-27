import hashlib
import hmac
import logging
import os
import secrets
import time
from collections import deque
from datetime import datetime, timedelta, timezone

import jwt

ALGO = "HS256"
ITERATIONS = 200_000
log = logging.getLogger(__name__)
_local_secret = secrets.token_hex(32)


def _secret() -> str:
    """Signing key. JWT_SECRET wins. Without it: a database-derived key on a real database (demo
    deployments), or a random per-process key for local SQLite. There is no hard-coded default."""
    explicit = os.getenv("JWT_SECRET")
    if explicit:
        return explicit
    if os.getenv("APP_ENV") == "production":
        raise RuntimeError("JWT_SECRET must be set when APP_ENV=production")
    url = os.getenv("DATABASE_URL", "")
    if url and not url.startswith("sqlite"):
        log.warning("JWT_SECRET is not set; deriving the signing key from DATABASE_URL (demo only)")
        return hashlib.sha256(("jwt:" + url).encode()).hexdigest()
    return _local_secret


MAX_FAILS = int(os.getenv("LOGIN_MAX_FAILS", "5"))
FAIL_WINDOW_S = int(os.getenv("LOGIN_FAIL_WINDOW_S", "300"))
_fails: dict[str, deque] = {}


def throttle_check(key: str) -> int:
    """Seconds to wait if this login key has MAX_FAILS recent failures, else 0.

    Kept in process memory, so it limits guessing per server instance. Behind several instances or
    serverless functions use a shared limiter (Redis, API gateway) for hard guarantees."""
    now = time.monotonic()
    q = _fails.get(key)
    if not q:
        return 0
    while q and now - q[0] > FAIL_WINDOW_S:
        q.popleft()
    return int(FAIL_WINDOW_S - (now - q[0])) + 1 if len(q) >= MAX_FAILS else 0


def throttle_fail(key: str) -> None:
    if len(_fails) > 10_000:
        _fails.clear()
    _fails.setdefault(key, deque()).append(time.monotonic())


def throttle_reset(key: str) -> None:
    _fails.pop(key, None)


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, ITERATIONS)
    return f"{salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt_hex, dk_hex = stored.split("$")
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt_hex), ITERATIONS)
    return hmac.compare_digest(dk.hex(), dk_hex)


def create_token(user_id: int, minutes: int = 60) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    return jwt.encode({"sub": str(user_id), "exp": exp}, _secret(), algorithm=ALGO)


def decode_token(token: str) -> int:
    return int(jwt.decode(token, _secret(), algorithms=[ALGO])["sub"])
