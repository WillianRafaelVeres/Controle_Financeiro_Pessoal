"""JWT verification via Supabase Auth."""

import httpx


async def verify_supabase_token(token: str, supabase_url: str, supabase_anon_key: str) -> str:
    """Verify a Supabase JWT by calling /auth/v1/user.

    Returns the user_id (UUID string) on success, raises ValueError on failure.
    """
    if not supabase_url or not supabase_anon_key:
        raise ValueError("Supabase nao configurado no servidor.")
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
        return str(user_id)
    except httpx.RequestError as exc:
        raise ValueError(f"Erro ao verificar token: {exc}") from exc
