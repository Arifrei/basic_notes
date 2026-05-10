from __future__ import annotations

from typing import Any

import requests


class AIConfigurationError(RuntimeError):
    pass


def build_system_prompt(notes: list[dict[str, str]], max_chars: int) -> str:
    used = 0
    parts: list[str] = []

    for note in notes:
        block = f"## {note['title'] or 'Untitled'}\n{note['content'] or ''}"
        if used + len(block) > max_chars:
            break
        parts.append(block)
        used += len(block)

    context = "\n\n---\n\n".join(parts)
    return (
        "You are an expert software evaluation assistant. Answer the user's question "
        "using ONLY the provided notes about software the user has evaluated.\n\n"
        "Keep answers concise but high-signal. Lead with the direct answer, prefer short "
        "paragraphs or bullets, and avoid repeating the same evidence. When giving "
        "recommendations, default to the top 3 best matches unless the user asks for more.\n\n"
        "When the user describes a scenario and asks for recommendations, rank the top "
        "options based on how well their evaluated softwares match the scenario, citing "
        "specific evidence from the notes.\n\n"
        'Always cite sources by note title in your answer (e.g., "According to your '
        'notes on **Linear**, ..."). If the notes don\'t contain relevant info, say so directly.\n\n'
        "Format with markdown.\n\n"
        "=== USER'S NOTES ===\n"
        f"{context or '(no notes found)'}\n"
        "=== END NOTES ==="
    )


def build_payload(
    *,
    question: str,
    history: list[dict[str, Any]],
    notes: list[dict[str, str]],
    config: dict[str, Any],
) -> dict[str, Any]:
    clean_history: list[dict[str, str]] = []
    history_limit = int(config.get("CHAT_HISTORY_LIMIT", 0) or 0)
    history_slice = history[-history_limit:] if history_limit > 0 else history
    for message in history_slice:
        role = str(message.get("role", "")).strip()
        content = str(message.get("content", "")).strip()
        if role in {"user", "assistant"} and content:
            clean_history.append({"role": role, "content": content})

    system = build_system_prompt(notes, config["MAX_CONTEXT_CHARS"])
    payload = {
        "model": config["AI_MODEL"],
        "stream": True,
        "messages": [
            {"role": "system", "content": system},
            *clean_history,
            {"role": "user", "content": question},
        ],
    }
    max_tokens = int(config.get("AI_MAX_TOKENS", 0) or 0)
    if max_tokens > 0:
        if config.get("AI_PROVIDER") in {"openai", "openai-compatible", "compatible"}:
            payload["max_completion_tokens"] = max_tokens
        else:
            payload["max_tokens"] = max_tokens
    return payload


def open_stream(payload: dict[str, Any], config: dict[str, Any]) -> requests.Response:
    provider = config["AI_PROVIDER"]
    timeout = (10, int(config["AI_TIMEOUT_SECONDS"]))

    if provider == "lovable":
        api_key = config["LOVABLE_API_KEY"]
        if not api_key:
            raise AIConfigurationError("LOVABLE_API_KEY is not configured.")
        url = "https://ai.gateway.lovable.dev/v1/chat/completions"
    elif provider in {"openai", "openai-compatible", "compatible"}:
        api_key = config["AI_API_KEY"]
        if not api_key:
            raise AIConfigurationError("AI_API_KEY is not configured for the OpenAI-compatible provider.")
        url = config["OPENAI_BASE_URL"]
    else:
        raise AIConfigurationError(f"Unsupported AI_PROVIDER: {provider}")

    return requests.post(
        url,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json=payload,
        stream=True,
        timeout=timeout,
    )
