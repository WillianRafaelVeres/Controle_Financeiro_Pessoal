from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel

from app.core.paths import default_data_dir


class Settings(BaseModel):
    app_name: str = "Central Financeira Pessoal"
    api_prefix: str = "/api"
    data_dir: Path = default_data_dir()
    database_file: Path = data_dir / "central_financeira.db"
    logs_dir: Path = data_dir / "logs"
    backups_dir: Path = data_dir / "backups"
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    @property
    def database_url(self) -> str:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.backups_dir.mkdir(parents=True, exist_ok=True)
        return f"sqlite:///{self.database_file.as_posix()}"


@lru_cache
def get_settings() -> Settings:
    return Settings()
