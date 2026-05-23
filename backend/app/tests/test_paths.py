import os
from pathlib import Path

from app.core.paths import default_data_dir


def test_default_data_dir_prefers_appdata_db_when_present(tmp_path, monkeypatch):
    appdata_root = tmp_path / "Roaming"
    appdata_root.mkdir()
    appdata_dir = appdata_root / "CentralFinanceira"
    appdata_dir.mkdir()
    (appdata_dir / "central_financeira.db").write_text("")

    monkeypatch.setenv("APPDATA", str(appdata_root))
    monkeypatch.delenv("CENTRAL_FINANCEIRA_DATA_DIR", raising=False)
    monkeypatch.delenv("CENTRAL_FINANCEIRA_DESKTOP", raising=False)

    assert default_data_dir() == appdata_dir


def test_default_data_dir_uses_custom_env_dir_overrides_appdata(tmp_path, monkeypatch):
    custom_dir = tmp_path / "custom"
    custom_dir.mkdir()
    appdata_root = tmp_path / "Roaming"
    appdata_root.mkdir()
    appdata_dir = appdata_root / "CentralFinanceira"
    appdata_dir.mkdir()
    (appdata_dir / "central_financeira.db").write_text("")

    monkeypatch.setenv("CENTRAL_FINANCEIRA_DATA_DIR", str(custom_dir))
    monkeypatch.setenv("APPDATA", str(appdata_root))
    monkeypatch.delenv("CENTRAL_FINANCEIRA_DESKTOP", raising=False)

    assert default_data_dir() == custom_dir
