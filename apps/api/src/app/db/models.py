"""Postgres-portable schema: typed ORM only, UUIDs as strings, JSON columns, UTC timestamps."""
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Entity(Base):
    __tablename__ = "entities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    type: Mapped[str] = mapped_column(String(32), index=True)  # company|person|product|article|technology|organization|event
    name: Mapped[str] = mapped_column(String(512), index=True)
    canonical_key: Mapped[str | None] = mapped_column(String(256), unique=True, nullable=True)
    attrs: Mapped[dict] = mapped_column(JSON, default=dict)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(default=utcnow, onupdate=utcnow)


class Edge(Base):
    __tablename__ = "edges"
    __table_args__ = (UniqueConstraint("src_id", "dst_id", "type", name="uq_edge"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    src_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    dst_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    type: Mapped[str] = mapped_column(String(48))  # FOUNDED_BY|LED_BY|MAKES|COMPETES_WITH|MENTIONS|USES_TECH|SUBSIDIARY_OF|...
    attrs: Mapped[dict] = mapped_column(JSON, default=dict)
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    provenance_id: Mapped[str | None] = mapped_column(ForeignKey("provenance.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Claim(Base):
    __tablename__ = "claims"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"), index=True)
    predicate: Mapped[str] = mapped_column(String(128))
    value: Mapped[dict] = mapped_column(JSON)  # {"text": ..., "raw": ...}
    confidence: Mapped[float] = mapped_column(Float, default=1.0)
    provenance_id: Mapped[str | None] = mapped_column(ForeignKey("provenance.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Provenance(Base):
    __tablename__ = "provenance"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    source_id: Mapped[str] = mapped_column(String(64))
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    retrieved_at: Mapped[datetime] = mapped_column(default=utcnow)
    extraction_method: Mapped[str] = mapped_column(String(16), default="deterministic")  # deterministic|llm|template


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    query: Mapped[str] = mapped_column(String(512))
    entity_id: Mapped[str | None] = mapped_column(ForeignKey("entities.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="queued")  # queued|running|completed|failed
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(nullable=True)


class JobEvent(Base):
    __tablename__ = "job_events"
    __table_args__ = (UniqueConstraint("job_id", "seq", name="uq_job_seq"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    type: Mapped[str] = mapped_column(String(32))
    agent: Mapped[str | None] = mapped_column(String(32), nullable=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    ts: Mapped[datetime] = mapped_column(default=utcnow)


class CategoryResult(Base):
    __tablename__ = "category_results"
    __table_args__ = (UniqueConstraint("job_id", "category", name="uq_job_category"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    category: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(16), default="completed")  # completed|failed
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    ts: Mapped[datetime] = mapped_column(default=utcnow)


class Document(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    job_id: Mapped[str] = mapped_column(ForeignKey("jobs.id"), index=True)
    entity_id: Mapped[str] = mapped_column(ForeignKey("entities.id"))
    markdown: Mapped[str] = mapped_column(Text)
    method: Mapped[str] = mapped_column(String(16), default="template")  # template|llm
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class HttpCache(Base):
    __tablename__ = "http_cache"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    url: Mapped[str] = mapped_column(Text)
    status: Mapped[int] = mapped_column(Integer)
    body: Mapped[str] = mapped_column(Text)
    retrieved_at: Mapped[datetime] = mapped_column(default=utcnow)
    ttl_seconds: Mapped[int] = mapped_column(Integer, default=3600)
