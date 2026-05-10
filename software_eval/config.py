from __future__ import annotations

import os


def _truthy(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


def _env_first(*names: str, default: str = "") -> str:
    for name in names:
        value = os.getenv(name)
        if value is not None and value.strip():
            return value.strip()
    return default


def _database_url() -> str:
    url = os.getenv("DATABASE_URL", "sqlite:///software_eval.db").strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and not url.startswith("postgresql+"):
        return "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev")
    SQLALCHEMY_DATABASE_URI = _database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    JSON_SORT_KEYS = False

    AUTO_INIT_DB = _truthy("AUTO_INIT_DB", "1")

    AI_API_KEY = _env_first("AI_API_KEY", "OPENAI_API_KEY", "openai_api_key")
    LOVABLE_API_KEY = _env_first("LOVABLE_API_KEY", "lovable_api_key")
    AI_PROVIDER = _env_first("AI_PROVIDER", "ai_provider")
    if not AI_PROVIDER:
        AI_PROVIDER = "openai" if AI_API_KEY else "lovable"
    AI_PROVIDER = AI_PROVIDER.lower()

    AI_MODEL = _env_first("AI_MODEL", "ai_model")
    if not AI_MODEL:
        AI_MODEL = "gpt-4.1-mini" if AI_PROVIDER in {"openai", "openai-compatible", "compatible"} else "google/gemini-3-flash-preview"
    AI_MAX_TOKENS = int(os.getenv("AI_MAX_TOKENS", "450"))
    AI_TIMEOUT_SECONDS = int(os.getenv("AI_TIMEOUT_SECONDS", "120"))
    OPENAI_BASE_URL = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1/chat/completions").strip()

    MAX_NOTES = int(os.getenv("MAX_NOTES", "200"))
    MAX_CONTEXT_CHARS = int(os.getenv("MAX_CONTEXT_CHARS", "120000"))
    CHAT_HISTORY_LIMIT = int(os.getenv("CHAT_HISTORY_LIMIT", "0"))
