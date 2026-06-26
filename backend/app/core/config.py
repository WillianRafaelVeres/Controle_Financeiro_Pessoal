import os
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from pydantic import BaseModel

from app.core.paths import default_data_dir


def _load_env_files() -> None:
    try:
        from dotenv import load_dotenv
    except ImportError:
        return

    backend_env = Path(__file__).resolve().parents[2] / ".env"
    load_dotenv(backend_env)

    appdata = os.getenv("APPDATA")
    if appdata:
        load_dotenv(Path(appdata) / "CentralFinanceira" / ".env")


class Settings(BaseModel):
    app_name: str = "Central Financeira Pessoal"
    app_version: str = "2026.06.26-v1-supabase-render"
    api_prefix: str = "/api"
    data_dir: Path = default_data_dir()
    database_file: Path = data_dir / "central_financeira.db"
    logs_dir: Path = data_dir / "logs"
    backups_dir: Path = data_dir / "backups"
    database_url_override: str | None = None
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "https://controle-financeiro-pessoal-jz43.onrender.com",
    ]
    cors_origin_regex: str = r"^https?://(localhost|127\.0\.0\.1):\d+$"

    @staticmethod
    def _list_from_env(value: str | None) -> list[str] | None:
        if not value:
            return None
        items = [item.strip().rstrip("/") for item in value.split(",") if item.strip()]
        return items or None

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            if self.database_url_override.startswith("postgres://"):
                return self.database_url_override.replace("postgres://", "postgresql://", 1)
            return self.database_url_override
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.backups_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{self.database_file.as_posix()}"

    @property
    def using_postgres(self) -> bool:
        return self.database_url.startswith(("postgresql://", "postgresql+"))

    @property
    def database_url_safe(self) -> str:
        if not self.database_url_override:
            return self.database_url
        try:
            parts = urlsplit(self.database_url)
            username = parts.username or ""
            host = parts.hostname or ""
            port = f":{parts.port}" if parts.port else ""
            userinfo = f"{username}:***@" if username else ""
            return urlunsplit((parts.scheme, f"{userinfo}{host}{port}", parts.path, parts.query, parts.fragment))
        except Exception:
            return "***"


@lru_cache
def get_settings() -> Settings:
    _load_env_files()
    cors_origins = Settings._list_from_env(os.getenv("CORS_ORIGINS"))
    return Settings(
        database_url_override=os.getenv("DATABASE_URL"),
        **({"cors_origins": cors_origins} if cors_origins else {}),
    )
