from __future__ import annotations

from datetime import datetime, timezone
import uuid

from sqlalchemy import event

from .database import db


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Folder(db.Model):
    __tablename__ = "folders"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.Text, nullable=False, default="New folder")
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    notes = db.relationship("Note", back_populates="folder", lazy="selectin")

    def to_dict(self) -> dict[str, str]:
        return {
            "id": self.id,
            "name": self.name,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Note(db.Model):
    __tablename__ = "notes"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.Text, nullable=False, default="Untitled")
    content = db.Column(db.Text, nullable=False, default="")
    folder_id = db.Column(db.String(36), db.ForeignKey("folders.id", ondelete="SET NULL"), index=True, nullable=True)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow, index=True)

    folder = db.relationship("Folder", back_populates="notes", lazy="joined")
    chunks = db.relationship(
        "NoteChunk",
        back_populates="note",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="NoteChunk.chunk_index",
    )

    def to_dict(self) -> dict[str, str | None]:
        return {
            "id": self.id,
            "title": self.title,
            "content": self.content,
            "folder_id": self.folder_id,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class NoteChunk(db.Model):
    __tablename__ = "note_chunks"

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    note_id = db.Column(db.String(36), db.ForeignKey("notes.id", ondelete="CASCADE"), index=True, nullable=False)
    chunk_index = db.Column(db.Integer, nullable=False)
    content = db.Column(db.Text, nullable=False)
    embedding = db.Column(db.JSON, nullable=False, default=list)
    created_at = db.Column(db.DateTime(timezone=True), nullable=False, default=utcnow)

    note = db.relationship("Note", back_populates="chunks")


@event.listens_for(Folder, "before_update")
def _touch_folder(_: type[Folder], __: object, target: Folder) -> None:
    target.updated_at = utcnow()


@event.listens_for(Note, "before_update")
def _touch_note(_: type[Note], __: object, target: Note) -> None:
    target.updated_at = utcnow()
