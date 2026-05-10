from __future__ import annotations

import math
import re


DIM = 768
TOKEN_RE = re.compile(r"[^a-z0-9\s]+")
HEADING_RE = re.compile(r"^#\s+(.+?)\s*$", re.MULTILINE)
MARKDOWN_STRIP_RE = re.compile(r"[#*`_>\-\[\]\(\)]")


def tokenize(text: str) -> list[str]:
    cleaned = TOKEN_RE.sub(" ", text.lower())
    return [token for token in cleaned.split() if 1 < len(token) < 40]


def fnv_hash(text: str, seed: int = 2166136261) -> int:
    value = seed & 0xFFFFFFFF
    for char in text:
        value ^= ord(char)
        value = (value * 16777619) & 0xFFFFFFFF
    if value >= 2**31:
        value -= 2**32
    return abs(value)


def embed_local(text: str) -> list[float]:
    vector = [0.0] * DIM
    tokens = tokenize(text)
    if not tokens:
        return vector

    for token in tokens:
        index = fnv_hash(token) % DIM
        sign = 1 if (fnv_hash(token, 1) & 1) else -1
        vector[index] += float(sign)

    for index in range(len(tokens) - 1):
        bigram = f"{tokens[index]}_{tokens[index + 1]}"
        bucket = fnv_hash(bigram) % DIM
        sign = 1 if (fnv_hash(bigram, 1) & 1) else -1
        vector[bucket] += sign * 0.5

    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [value / norm for value in vector]


def chunk_markdown(text: str, max_chars: int = 1800) -> list[str]:
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", text) if part.strip()]
    if not paragraphs:
        return [text]

    chunks: list[str] = []
    buffer = ""
    for paragraph in paragraphs:
        candidate = f"{buffer}\n\n{paragraph}" if buffer else paragraph
        if len(candidate) > max_chars and buffer:
            chunks.append(buffer)
            buffer = paragraph
        else:
            buffer = candidate
    if buffer:
        chunks.append(buffer)
    return chunks or [text]


def derive_title(content: str) -> str:
    match = HEADING_RE.search(content or "")
    if match:
        title = match.group(1).strip()
        if title:
            return title
    return "Untitled"


def split_bulk_markdown(text: str) -> list[dict[str, str]]:
    lines = text.replace("\r\n", "\n").split("\n")
    notes: list[dict[str, str]] = []
    current_title: str | None = None
    current_body: list[str] = []

    def flush() -> None:
        nonlocal current_title, current_body
        if current_title is not None:
            notes.append(
                {
                    "title": current_title.strip() or "Untitled",
                    "content": "\n".join(current_body).strip(),
                }
            )

    for line in lines:
        match = re.match(r"^#\s+(.+?)\s*$", line)
        if match:
            flush()
            current_title = match.group(1)
            current_body = []
        elif current_title is not None:
            current_body.append(line)

    flush()

    if not notes and text.strip():
        notes.append({"title": "Untitled", "content": text.strip()})
    return notes


def content_with_heading(title: str, body: str) -> str:
    title_text = title.strip() or "Untitled"
    content = body.strip()
    if content.startswith("#"):
        return content
    if not content:
        return f"# {title_text}\n\n"
    return f"# {title_text}\n\n{content}"


def strip_markdown(text: str, limit: int = 160) -> str:
    cleaned = MARKDOWN_STRIP_RE.sub("", text or "")
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned[:limit]
