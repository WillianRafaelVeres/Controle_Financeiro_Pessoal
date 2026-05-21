import argparse
import logging
import os
import socket
import sys
from pathlib import Path


DEFAULT_PORT = 17831


def resource_path(relative: str) -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return base / relative


def app_data_dir() -> Path:
    env_dir = os.getenv("CENTRAL_FINANCEIRA_DATA_DIR")
    if env_dir:
        return Path(env_dir)
    appdata = os.getenv("APPDATA")
    if appdata:
        return Path(appdata) / "CentralFinanceira"
    return Path.home() / "AppData" / "Roaming" / "CentralFinanceira"


def setup_environment() -> tuple[Path, Path]:
    data_dir = app_data_dir()
    logs_dir = data_dir / "logs"
    backups_dir = data_dir / "backups"
    logs_dir.mkdir(parents=True, exist_ok=True)
    backups_dir.mkdir(parents=True, exist_ok=True)
    os.environ["CENTRAL_FINANCEIRA_DESKTOP"] = "1"
    os.environ["CENTRAL_FINANCEIRA_DATA_DIR"] = str(data_dir)
    return data_dir, logs_dir


def configure_logging(logs_dir: Path) -> Path:
    log_file = logs_dir / "backend.log"
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s",
        handlers=[logging.FileHandler(log_file, encoding="utf-8"), logging.StreamHandler(sys.stdout)],
    )
    return log_file


def port_is_available(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("127.0.0.1", port))
            return True
    except OSError as exc:
        logging.info("Porta %s indisponivel: %s", port, exc)
        return False


def find_free_port(preferred: int = DEFAULT_PORT) -> int:
    candidates = [preferred, *range(preferred + 1, preferred + 80)]
    for port in candidates:
        if port_is_available(port):
            return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def write_port_file(data_dir: Path, port: int) -> Path:
    path = data_dir / "backend-port.json"
    path.write_text(f'{{"host":"127.0.0.1","port":{port},"baseUrl":"http://127.0.0.1:{port}/api"}}', encoding="utf-8")
    return path


def run_migrations() -> None:
    from alembic import command
    from alembic.config import Config

    alembic_ini = resource_path("alembic.ini")
    if not alembic_ini.exists():
        alembic_ini = Path(__file__).resolve().parent / "alembic.ini"
    config = Config(str(alembic_ini))
    config.config_file_name = None
    config.set_main_option("script_location", str(resource_path("alembic")))
    from app.core.config import get_settings

    config.set_main_option("sqlalchemy.url", get_settings().database_url)
    logging.info("Rodando migrations Alembic em %s", get_settings().database_file)
    command.upgrade(config, "head")
    logging.info("Migrations concluidas")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Central Financeira backend desktop")
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--port-file", type=str, default=None)
    return parser.parse_args()


def main() -> int:
    data_dir, logs_dir = setup_environment()
    log_file = configure_logging(logs_dir)
    args = parse_args()
    try:
        logging.info("Iniciando Central Financeira backend desktop")
        logging.info("Pasta de dados: %s", data_dir)
        logging.info("Log: %s", log_file)
        run_migrations()
        port = find_free_port(args.port)
        os.environ["CENTRAL_FINANCEIRA_PORT"] = str(port)
        port_file = Path(args.port_file) if args.port_file else write_port_file(data_dir, port)
        if args.port_file:
            port_file.parent.mkdir(parents=True, exist_ok=True)
            port_file.write_text(
                f'{{"host":"127.0.0.1","port":{port},"baseUrl":"http://127.0.0.1:{port}/api"}}',
                encoding="utf-8",
            )
        logging.info("Porta escolhida: %s", port)
        logging.info("Arquivo de porta: %s", port_file)

        import uvicorn

        uvicorn.run("app.main:app", host="127.0.0.1", port=port, reload=False, log_config=None)
        logging.info("Backend encerrado")
        return 0
    except Exception:
        logging.exception("Falha ao iniciar backend desktop")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
