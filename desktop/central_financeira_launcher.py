from __future__ import annotations

import atexit
import ctypes
import functools
import os
import socket
import subprocess
import sys
import threading
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen


APP_NAME = "Central Financeira"
BACKEND_PORT = 17831
FRONTEND_PORT = 5173
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

backend_process: subprocess.Popen[bytes] | None = None
frontend_server: ThreadingHTTPServer | None = None


def bundled_root() -> Path:
    return Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))


def app_data_dir() -> Path:
    appdata = os.getenv("APPDATA")
    base = Path(appdata) if appdata else Path.home() / "AppData" / "Roaming"
    path = base / "CentralFinanceira"
    path.mkdir(parents=True, exist_ok=True)
    return path


def frontend_dir() -> Path:
    root = bundled_root()
    bundled = root / "web"
    if bundled.exists():
        return bundled
    return Path(__file__).resolve().parents[1] / "frontend" / "dist"


def backend_exe() -> Path:
    root = bundled_root()
    bundled = root / "backend" / "central-financeira-backend.exe"
    if bundled.exists():
        return bundled
    return Path(__file__).resolve().parents[1] / "backend" / "dist" / "central-financeira-backend.exe"


def find_edge() -> Path:
    candidates = [
        Path(os.getenv("ProgramFiles(x86)", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
        Path(os.getenv("ProgramFiles", "")) / "Microsoft" / "Edge" / "Application" / "msedge.exe",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return Path("msedge.exe")


def port_available(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", port))
            return True
    except OSError:
        return False


def find_free_port(preferred: int) -> int:
    for port in [preferred, *range(preferred + 1, preferred + 80)]:
        if port_available(port):
            return port
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def health_ok() -> bool:
    try:
        with urlopen(f"http://127.0.0.1:{BACKEND_PORT}/health", timeout=1) as response:
            return response.status == 200
    except (OSError, URLError):
        return False


def wait_for_backend() -> None:
    for _ in range(80):
        if health_ok():
            return
        time.sleep(0.25)
    raise RuntimeError("Backend local indisponivel.")


class SpaHandler(SimpleHTTPRequestHandler):
    def send_head(self):  # type: ignore[override]
        translated = Path(self.translate_path(self.path))
        if not translated.exists() or translated.is_dir():
            self.path = "/index.html"
        return super().send_head()

    def log_message(self, format: str, *args: object) -> None:
        return


def start_frontend() -> tuple[ThreadingHTTPServer, int]:
    web_dir = frontend_dir()
    if not (web_dir / "index.html").exists():
        raise RuntimeError(f"Interface nao encontrada em {web_dir}.")
    port = find_free_port(FRONTEND_PORT)
    handler = functools.partial(SpaHandler, directory=str(web_dir))
    server = ThreadingHTTPServer(("127.0.0.1", port), handler)
    thread = threading.Thread(target=server.serve_forever, name="frontend", daemon=True)
    thread.start()
    return server, port


def start_backend() -> subprocess.Popen[bytes] | None:
    if health_ok():
        return None
    exe = backend_exe()
    if not exe.exists():
        raise RuntimeError(f"Backend nao encontrado em {exe}.")
    env = os.environ.copy()
    env["CENTRAL_FINANCEIRA_DATA_DIR"] = str(app_data_dir())
    return subprocess.Popen(
        [str(exe), "--port", str(BACKEND_PORT)],
        cwd=str(exe.parent),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=CREATE_NO_WINDOW,
        env=env,
    )


def edge_processes_running(profile_dir: Path) -> bool:
    escaped = str(profile_dir).replace("'", "''")
    script = (
        "Get-CimInstance Win32_Process -Filter \"name='msedge.exe'\" | "
        f"Where-Object {{ $_.CommandLine -like '*{escaped}*' }} | "
        "Select-Object -First 1 -ExpandProperty ProcessId"
    )
    result = subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        text=True,
        creationflags=CREATE_NO_WINDOW,
        timeout=5,
    )
    return bool(result.stdout.strip())


def open_app_window(port: int) -> subprocess.Popen[bytes]:
    edge = find_edge()
    profile_dir = app_data_dir() / "edge-profile"
    profile_dir.mkdir(parents=True, exist_ok=True)
    url = f"http://127.0.0.1:{port}"
    return subprocess.Popen(
        [
            str(edge),
            f"--app={url}",
            f"--user-data-dir={profile_dir}",
            "--no-first-run",
            "--disable-features=Translate",
        ],
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=CREATE_NO_WINDOW,
    )


def cleanup() -> None:
    global backend_process, frontend_server
    if frontend_server is not None:
        frontend_server.shutdown()
        frontend_server.server_close()
        frontend_server = None
    if backend_process is not None and backend_process.poll() is None:
        backend_process.terminate()
        try:
            backend_process.wait(timeout=4)
        except subprocess.TimeoutExpired:
            backend_process.kill()
    backend_process = None


def main() -> int:
    global backend_process, frontend_server
    atexit.register(cleanup)
    try:
        backend_process = start_backend()
        wait_for_backend()
        frontend_server, frontend_port = start_frontend()
        edge_process = open_app_window(frontend_port)
        edge_process.wait()
        profile_dir = app_data_dir() / "edge-profile"
        while edge_processes_running(profile_dir):
            time.sleep(1.5)
        return 0
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        ctypes.windll.user32.MessageBoxW(None, str(exc), APP_NAME, 0x10)
        raise SystemExit(1)
