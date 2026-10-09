"""Runtime configuration for the AI service, read from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache


@dataclass(frozen=True)
class Settings:
    """Typed view over the environment so the rest of the service never calls os.getenv."""

    anthropic_api_key: str | None
    claude_model: str
    claude_effort: str
    chroma_persist_dir: str | None
    chroma_host: str | None
    chroma_port: int
    mongo_url: str | None
    mongo_db_name: str | None
    sentry_dsn: str | None
    allowed_origins: list[str]
    ai_internal_token: str | None = None


@lru_cache
def get_settings() -> Settings:
    """Build settings once per process."""
    origins = os.getenv("ALLOWED_ORIGINS", "*")
    return Settings(
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY") or None,
        claude_model=os.getenv("CLAUDE_MODEL", "claude-opus-5-5"),
        claude_effort=os.getenv("CLAUDE_EFFORT", "medium"),
        chroma_persist_dir=os.getenv("CHROMA_PERSIST_DIR") or None,
        chroma_host=os.getenv("CHROMA_HOST") or None,
        chroma_port=int(os.getenv("CHROMA_PORT", "8000")),
        mongo_url=os.getenv("MONGO_URL") or os.getenv("MONGODB_URI") or None,
        mongo_db_name=os.getenv("MONGO_DB_NAME") or None,
        sentry_dsn=os.getenv("SENTRY_DSN") or None,
        allowed_origins=[o.strip() for o in origins.split(",") if o.strip()],
        ai_internal_token=os.getenv("AI_INTERNAL_TOKEN") or None,
    )
