import asyncio
import base64
import json
import time

from app.core import security


def _fake_jwt(exp: float) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode()).decode().rstrip("=")
    payload = base64.urlsafe_b64encode(json.dumps({"exp": exp}).encode()).decode().rstrip("=")
    return f"{header}.{payload}.signature"


def test_verify_supabase_token_reuses_cached_user(monkeypatch):
    security._token_cache.clear()
    token = _fake_jwt(time.time() + 3600)
    calls = 0

    class Response:
        status_code = 200

        def json(self):
            return {"id": "user-1"}

    class FakeClient:
        def __init__(self, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return None

        async def get(self, url, headers):
            nonlocal calls
            calls += 1
            return Response()

    monkeypatch.setattr(security.httpx, "AsyncClient", FakeClient)

    user_id = asyncio.run(security.verify_supabase_token(token, "https://example.supabase.co", "anon"))
    cached_user_id = asyncio.run(security.verify_supabase_token(token, "https://example.supabase.co", "anon"))

    assert user_id == "user-1"
    assert cached_user_id == "user-1"
    assert calls == 1
