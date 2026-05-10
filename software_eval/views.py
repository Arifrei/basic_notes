from __future__ import annotations

from http import HTTPStatus
from typing import Any

from flask import Blueprint, Response, current_app, jsonify, render_template, request, stream_with_context

from .ai import AIConfigurationError, build_payload, open_stream
from .database import db
from .embedding import (
    chunk_markdown,
    content_with_heading,
    derive_title,
    embed_local,
    split_bulk_markdown,
    strip_markdown,
)
from .markdown_utils import render_markdown
from .models import Folder, Note, NoteChunk


bp = Blueprint("app", __name__)


def get_bootstrap_payload() -> dict[str, Any]:
    notes = Note.query.order_by(Note.updated_at.desc()).all()
    folders = Folder.query.order_by(Folder.name.asc()).all()
    return {
        "notes": [note.to_dict() for note in notes],
        "folders": [folder.to_dict() for folder in folders],
    }


def _normalize_folder(folder_id: str | None) -> str | None:
    if folder_id in {None, "", "null"}:
        return None
    folder = db.session.get(Folder, folder_id)
    if not folder:
        raise ValueError("Folder not found.")
    return folder.id


def _reindex_note(note: Note) -> None:
    try:
        NoteChunk.query.filter_by(note_id=note.id).delete(synchronize_session=False)
        text = f"# {note.title}\n\n{note.content or ''}".strip()
        rows = [
            NoteChunk(
                note_id=note.id,
                chunk_index=index,
                content=chunk,
                embedding=embed_local(chunk),
            )
            for index, chunk in enumerate(chunk_markdown(text))
        ]
        if rows:
            db.session.add_all(rows)
        db.session.commit()
    except Exception:  # pragma: no cover - best effort indexing
        db.session.rollback()
        current_app.logger.exception("Failed to index note %s", note.id)


@bp.get("/")
def index() -> str:
    return render_template("index.html", bootstrap=get_bootstrap_payload())


@bp.get("/n/<note_id>")
def shared_note(note_id: str) -> tuple[str, int] | str:
    note = db.session.get(Note, note_id)
    if not note:
        return render_template("shared_note.html", note=None), HTTPStatus.NOT_FOUND
    return render_template(
        "shared_note.html",
        note=note,
        rendered_content=render_markdown(note.content),
        description=strip_markdown(note.content, 160),
    )


@bp.get("/api/bootstrap")
def bootstrap() -> Response:
    return jsonify(get_bootstrap_payload())


@bp.route("/api/notes", methods=["GET", "POST"])
def notes_collection() -> Response:
    if request.method == "GET":
        return jsonify({"notes": [note.to_dict() for note in Note.query.order_by(Note.updated_at.desc()).all()]})

    data = request.get_json(silent=True) or {}
    content = str(data.get("content") or "# Untitled\n\n")
    raw_title = str(data.get("title") or "").strip()
    title = raw_title or derive_title(content)
    if title == "Untitled" and content.strip().startswith("#"):
        title = derive_title(content)

    try:
        folder_id = _normalize_folder(data.get("folder_id"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), HTTPStatus.BAD_REQUEST

    note = Note(title=title, content=content, folder_id=folder_id)
    db.session.add(note)
    db.session.commit()
    _reindex_note(note)
    return jsonify(note.to_dict()), HTTPStatus.CREATED


@bp.route("/api/notes/<note_id>", methods=["GET", "PUT", "DELETE"])
def note_item(note_id: str) -> Response:
    note = db.session.get(Note, note_id)
    if not note:
        return jsonify({"error": "Note not found."}), HTTPStatus.NOT_FOUND

    if request.method == "GET":
        payload = note.to_dict()
        payload["rendered_content"] = render_markdown(note.content)
        return jsonify(payload)

    if request.method == "DELETE":
        db.session.delete(note)
        db.session.commit()
        return jsonify({"ok": True})

    data = request.get_json(silent=True) or {}
    content = str(data.get("content", note.content))
    title = str(data.get("title") or derive_title(content)).strip() or "Untitled"
    note.title = title
    note.content = content

    if "folder_id" in data:
        try:
            note.folder_id = _normalize_folder(data.get("folder_id"))
        except ValueError as exc:
            return jsonify({"error": str(exc)}), HTTPStatus.BAD_REQUEST

    db.session.commit()
    _reindex_note(note)
    return jsonify(note.to_dict())


@bp.route("/api/folders", methods=["GET", "POST"])
def folders_collection() -> Response:
    if request.method == "GET":
        return jsonify({"folders": [folder.to_dict() for folder in Folder.query.order_by(Folder.name.asc()).all()]})

    data = request.get_json(silent=True) or {}
    name = str(data.get("name") or "New folder").strip() or "New folder"
    folder = Folder(name=name)
    db.session.add(folder)
    db.session.commit()
    return jsonify(folder.to_dict()), HTTPStatus.CREATED


@bp.route("/api/folders/<folder_id>", methods=["PUT", "DELETE"])
def folder_item(folder_id: str) -> Response:
    folder = db.session.get(Folder, folder_id)
    if not folder:
        return jsonify({"error": "Folder not found."}), HTTPStatus.NOT_FOUND

    if request.method == "DELETE":
        Note.query.filter_by(folder_id=folder.id).update({"folder_id": None}, synchronize_session=False)
        db.session.delete(folder)
        db.session.commit()
        return jsonify({"ok": True})

    data = request.get_json(silent=True) or {}
    folder.name = str(data.get("name") or folder.name).strip() or "Untitled folder"
    db.session.commit()
    return jsonify(folder.to_dict())


@bp.post("/api/import")
def import_notes() -> Response:
    data = request.get_json(silent=True) or {}
    text = str(data.get("text") or "")
    entries = split_bulk_markdown(text)

    created: list[Note] = []
    for entry in entries:
        title = entry["title"].strip() or "Untitled"
        content = content_with_heading(title, entry["content"])
        note = Note(title=title, content=content)
        db.session.add(note)
        created.append(note)

    db.session.commit()

    for note in created:
        _reindex_note(note)

    return jsonify(
        {
            "count": len(created),
            "notes": [note.to_dict() for note in created],
        }
    )


@bp.post("/api/markdown")
def markdown_preview() -> Response:
    data = request.get_json(silent=True) or {}
    content = str(data.get("content") or "")
    return jsonify({"html": render_markdown(content)})


@bp.post("/api/chat")
def chat() -> Response:
    data = request.get_json(silent=True) or {}
    question = str(data.get("question") or "").strip()
    history = data.get("history") or []
    if not question:
        return jsonify({"error": "question required"}), HTTPStatus.BAD_REQUEST

    notes = [
        {"title": note.title, "content": note.content}
        for note in Note.query.order_by(Note.updated_at.desc()).limit(current_app.config["MAX_NOTES"]).all()
    ]

    payload = build_payload(
        question=question,
        history=history,
        notes=notes,
        config=current_app.config,
    )

    try:
        upstream = open_stream(payload, current_app.config)
    except AIConfigurationError as exc:
        return jsonify({"error": str(exc)}), HTTPStatus.INTERNAL_SERVER_ERROR
    except Exception as exc:  # pragma: no cover - network/provider failure
        current_app.logger.exception("Failed to open AI stream")
        return jsonify({"error": str(exc)}), HTTPStatus.BAD_GATEWAY

    if not upstream.ok:
        body = upstream.text
        content_type = upstream.headers.get("Content-Type", "application/json")
        upstream.close()
        return Response(body, status=upstream.status_code, content_type=content_type)

    def generate():
        try:
            for chunk in upstream.iter_content(chunk_size=1024):
                if chunk:
                    yield chunk
        finally:
            upstream.close()

    return Response(
        stream_with_context(generate()),
        content_type=upstream.headers.get("Content-Type", "text/event-stream"),
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
