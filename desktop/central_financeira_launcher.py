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

import webview


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

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

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


def open_app_window(port: int) -> None:
    url = f"http://127.0.0.1:{port}"
    webview.create_window(
        APP_NAME,
        url,
        width=1360,
        height=860,
        min_size=(1100, 720),
        background_color="#07111f",
        text_select=True,
    )
    webview.start(gui="edgechromium", private_mode=False)


def terminate_process_tree(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            creationflags=CREATE_NO_WINDOW,
            timeout=8,
            check=False,
        )
        return
    process.terminate()
    try:
        process.wait(timeout=4)
    except subprocess.TimeoutExpired:
        process.kill()


def cleanup() -> None:
    global backend_process, frontend_server
    if frontend_server is not None:
        frontend_server.shutdown()
        frontend_server.server_close()
        frontend_server = None
    if backend_process is not None and backend_process.poll() is None:
        terminate_process_tree(backend_process)
    backend_process = None


def main() -> int:
    global backend_process, frontend_server
    atexit.register(cleanup)
    try:
        backend_process = start_backend()
        wait_for_backend()
        frontend_server, frontend_port = start_frontend()
        open_app_window(frontend_port)
        return 0
    finally:
        cleanup()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        ctypes.windll.user32.MessageBoxW(None, str(exc), APP_NAME, 0x10)
        raise SystemExit(1)
