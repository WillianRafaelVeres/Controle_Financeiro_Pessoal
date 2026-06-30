"""JWT verification via Supabase Auth."""

import base64
import binascii
import json
import time
from dataclasses import dataclass

import httpx


_TOKEN_CACHE_TTL_SECONDS = 60
_TOKEN_CACHE_MAX_SIZE = 512


@dataclass
class _CachedToken:
    user_id: str
    expires_at: float


_token_cache: dict[str, _CachedToken] = {}


def _jwt_exp(token: str) -> float | None:
    try:
        payload = token.split(".")[1]
        padding = "=" * (-len(payload) % 4)
        decoded = base64.urlsafe_b64decode(payload + padding)
        exp = json.loads(decoded).get("exp")
        return float(exp) if exp else None
    except (IndexError, ValueError, json.JSONDecodeError, TypeError, binascii.Error):
        return None


def _cached_user_id(token: str) -> str | None:
    cached = _token_cache.get(token)
    now = time.time()
    if not cached:
        return None
    if cached.expires_at <= now:
        _token_cache.pop(token, None)
        return None
    return cached.user_id


def _store_cached_user_id(token: str, user_id: str) -> None:
    now = time.time()
    jwt_exp = _jwt_exp(token)
    expires_at = now + _TOKEN_CACHE_TTL_SECONDS
    if jwt_exp:
        expires_at = min(expires_at, jwt_exp - 5)
    if expires_at <= now:
        return

    if len(_token_cache) >= _TOKEN_CACHE_MAX_SIZE:
        for cached_token, cached in list(_token_cache.items()):
            if cached.expires_at <= now:
                _token_cache.pop(cached_token, None)
        if len(_token_cache) >= _TOKEN_CACHE_MAX_SIZE:
            _token_cache.pop(next(iter(_token_cache)), None)

    _token_cache[token] = _CachedToken(user_id=user_id, expires_at=expires_at)


async def verify_supabase_token(token: str, supabase_url: str, supabase_anon_key: str) -> str:
    """Verify a Supabase JWT by calling /auth/v1/user.

    Returns the user_id (UUID string) on success, raises ValueError on failure.
    """
    if not supabase_url or not supabase_anon_key:
        raise ValueError("Supabase nao configurado no servidor.")
    cached_user_id = _cached_user_id(token)
    if cached_user_id:
        return cached_user_id

    url = f"{supabase_url.rstrip('/')}/auth/v1/user"
    try:
        async with httpx.AsyncClient(timeout=8) as client:
            resp = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "apikey": supabase_anon_key,
                },
            )
        if resp.status_code != 200:
            raise ValueError("Token invalido ou expirado.")
        data = resp.json()
        user_id = data.get("id")
        if not user_id:
            raise ValueError("Token sem user_id.")
        _store_cached_user_id(token, str(user_id))
        return str(user_id)
    except httpx.RequestError as exc:
        raise ValueError(f"Erro ao verificar token: {exc}") from exc
