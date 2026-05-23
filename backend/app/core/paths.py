import os
from pathlib import Path


def default_data_dir() -> Path:
    env_dir = os.getenv("CENTRAL_FINANCEIRA_DATA_DIR")
    if env_dir:
        return Path(env_dir)
    appdata = os.getenv("APPDATA")
    appdata_dir = Path(appdata) / "CentralFinanceira" if appdata else None
    if os.getenv("CENTRAL_FINANCEIRA_DESKTOP") == "1" and appdata_dir:
        return appdata_dir
    if appdata_dir and (appdata_dir / "central_financeira.db").exists():
        return appdata_dir
    return Path(__file__).resolve().parents[2] / "data"

