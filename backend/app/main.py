"""Main entry point for ORBITAL Backend Server (FastAPI + Standard Library HTTP Server)."""
from __future__ import annotations
import argparse
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Dict, Any

from .api.routes import handle_api_request, orbital_service

try:
    from fastapi import FastAPI, Request
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    HAS_FASTAPI = True
except ImportError:
    HAS_FASTAPI = False
    FastAPI = None  # type: ignore


if HAS_FASTAPI:
    app = FastAPI(
        title="ORBITAL — ML Satellite Task Scheduling API",
        description=(
            "Classical Random Forest feasibility classification and constraint-aware "
            "multi-strategy task scheduling for Agile Earth Observation Satellites."
        ),
        version="1.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def get_health() -> JSONResponse:
        status, payload = handle_api_request("GET", "/api/health")
        return JSONResponse(status_code=status, content=payload)

    @app.get("/api/model")
    async def get_model() -> JSONResponse:
        status, payload = handle_api_request("GET", "/api/model")
        return JSONResponse(status_code=status, content=payload)

    @app.get("/api/history")
    async def get_history() -> JSONResponse:
        status, payload = handle_api_request("GET", "/api/history")
        return JSONResponse(status_code=status, content=payload)

    @app.post("/api/schedule")
    async def post_schedule(request: Request) -> JSONResponse:
        try:
            body = await request.json()
        except Exception:
            return JSONResponse(
                status_code=400,
                content={"error": "Malformed JSON", "detail": "Unable to parse request JSON body"},
            )
        status, payload = handle_api_request("POST", "/api/schedule", body)
        return JSONResponse(status_code=status, content=payload)

    @app.post("/api/simulation")
    async def post_simulation(request: Request) -> JSONResponse:
        try:
            body = await request.json()
        except Exception:
            body = {}
        status, payload = handle_api_request("POST", "/api/simulation", body)
        return JSONResponse(status_code=status, content=payload)


class _OrbitalHTTPRequestHandler(BaseHTTPRequestHandler):
    """Zero-dependency HTTP handler exposing the exact same REST API when FastAPI/uvicorn is absent."""

    def _send_json(self, status_code: int, payload: Dict[str, Any]) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(raw)

    def do_OPTIONS(self) -> None:
        self._send_json(200, {"status": "ok"})

    def do_GET(self) -> None:
        status, payload = handle_api_request("GET", self.path)
        self._send_json(status, payload)

    def do_POST(self) -> None:
        content_length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"
        try:
            parsed_body = json.loads(raw_body) if raw_body.strip() else {}
        except json.JSONDecodeError:
            self._send_json(400, {"error": "Malformed JSON", "detail": "Invalid JSON body"})
            return
        status, payload = handle_api_request("POST", self.path, parsed_body)
        self._send_json(status, payload)

    def log_message(self, format: str, *args: Any) -> None:
        return  # Keep console output clean


def run_stdlib_server(host: str = "127.0.0.1", port: int = 8000) -> None:
    server = ThreadingHTTPServer((host, port), _OrbitalHTTPRequestHandler)
    print(f"ORBITAL Python Backend listening on http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="ORBITAL Backend Server")
    parser.add_argument("--host", default="127.0.0.1", help="Bind host")
    parser.add_argument("--port", type=int, default=8000, help="Bind port")
    args = parser.parse_args()
    run_stdlib_server(host=args.host, port=args.port)
