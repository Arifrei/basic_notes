from __future__ import annotations

import bleach
import markdown as md


MARKDOWN_EXTENSIONS = [
    "fenced_code",
    "tables",
    "sane_lists",
    "nl2br",
    "codehilite",
]

ALLOWED_TAGS = [
    "a",
    "blockquote",
    "br",
    "code",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "hr",
    "li",
    "ol",
    "p",
    "pre",
    "span",
    "strong",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
]

ALLOWED_ATTRIBUTES = {
    "a": ["href", "title", "rel", "target"],
    "code": ["class"],
    "div": ["class"],
    "pre": ["class"],
    "span": ["class"],
    "td": ["colspan", "rowspan"],
    "th": ["colspan", "rowspan"],
}


def render_markdown(text: str) -> str:
    source = text or "*(empty note)*"
    rendered = md.markdown(
        source,
        extensions=MARKDOWN_EXTENSIONS,
        extension_configs={
            "codehilite": {
                "css_class": "codehilite",
                "guess_lang": False,
                "use_pygments": True,
            }
        },
    )
    return bleach.clean(
        rendered,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        protocols=["http", "https", "mailto"],
        strip=True,
    )
