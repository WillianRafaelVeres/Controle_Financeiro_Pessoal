import os
from pathlib import Path


def default_data_dir() -> Path:
    env_dir = os.getenv("CENTRAL_FINANCEIRA_DATA_DIR")
    if env_dir:
        return Path(env_dir)
    appdata = os.getenv("APPDATA")
    if os.getenv("CENTRAL_FINANCEIRA_DESKTOP") == "1" and appdata:
        return Path(appdata) / "CentralFinanceira"
    return Path(__file__).resolve().parents[2] / "data"

