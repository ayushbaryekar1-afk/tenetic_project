"""Central configuration. Everything is read from environment variables / .env files.

Load order (later wins):
  1. <project root>/.env
  2. backend/.env
"""
import os
from dataclasses import dataclass
from pathlib import Path
from typing import List

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR.parent / ".env")
load_dotenv(BASE_DIR / ".env", override=True)


def _bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or raw.strip() == "":
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


def _normalize_host(host: str) -> str:
    host = host.strip().rstrip("/")
    if host and not host.startswith(("http://", "https://")):
        host = "https://" + host
    return host


def is_placeholder_token(value: str) -> bool:
    token = (value or "").strip()
    if not token:
        return True
    lowered = token.lower()
    placeholder_markers = (
        "generated",
        "placeholder",
        "your-token",
        "your token",
        "<token>",
        "<your token>",
        "paste your",
        "paste token",
        "replace me",
        "example token",
    )
    if any(marker in lowered for marker in placeholder_markers):
        return True
    return "<" in token or ">" in token


@dataclass(frozen=True)
class Settings:
    app_name: str
    demo_mode: bool
    databricks_host: str
    databricks_token: str
    databricks_agent_endpoint: str
    genie_agent_count: int
    request_timeout: float
    cors_origins: List[str]
    log_level: str

    @property
    def databricks_configured(self) -> bool:
        return bool(self.databricks_host and self.databricks_token and self.databricks_agent_endpoint)


def load_settings() -> Settings:
    origins = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
    databricks_token = os.getenv("DATABRICKS_TOKEN", "").strip()
    return Settings(
        app_name="Tenetic AI",
        demo_mode=_bool("DEMO_MODE", True),
        databricks_host=_normalize_host(os.getenv("DATABRICKS_HOST", "")),
        databricks_token=databricks_token,
        databricks_agent_endpoint=os.getenv("DATABRICKS_AGENT_ENDPOINT", "").strip(),
        genie_agent_count=_int("GENIE_AGENT_COUNT", 6),
        request_timeout=float(_int("REQUEST_TIMEOUT_SECONDS", 180)),
        cors_origins=[o.strip() for o in origins.split(",") if o.strip()],
        log_level=os.getenv("LOG_LEVEL", "INFO").upper(),
    )


settings = load_settings()
