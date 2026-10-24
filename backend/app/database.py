"""SQLite persistence for collected news, notes, and tasks."""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, time, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Literal
from uuid import uuid4

from app.pipeline import NewsItem

DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "news.db"
Period = Literal["today", "yesterday", "week", "all"]


def _connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    return connection


@contextmanager
def _connection() -> Iterator[sqlite3.Connection]:
    connection = _connect()
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database() -> None:
    with _connection() as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS news (
                category TEXT NOT NULL,
                link TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                published TEXT NOT NULL,
                published_at TEXT,
                source TEXT NOT NULL,
                PRIMARY KEY (category, link)
            );
            CREATE INDEX IF NOT EXISTS news_published_at ON news(published_at);
            CREATE TABLE IF NOT EXISTS notes (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                completed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            """
        )


def _published_at(value: str) -> str | None:
    if not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        try:
            parsed = parsedate_to_datetime(value)
        except (TypeError, ValueError, OverflowError):
            return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc).isoformat()


def save_news(category: str, items: list[NewsItem]) -> None:
    with _connection() as connection:
        connection.executemany(
            """
            INSERT INTO news (category, link, title, description, published, published_at, source)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(category, link) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                published = excluded.published,
                published_at = excluded.published_at,
                source = excluded.source
            """,
            [
                (
                    category,
                    item.link,
                    item.title,
                    item.description,
                    item.published,
                    _published_at(item.published),
                    item.source,
                )
                for item in items
            ],
        )


def list_news(category: str, period: Period, limit: int | None = None) -> list[NewsItem]:
    now = datetime.now(timezone.utc)
    if period == "today":
        start = datetime.combine(now.date(), time.min, timezone.utc)
        end = start + timedelta(days=1)
    elif period == "yesterday":
        end = datetime.combine(now.date(), time.min, timezone.utc)
        start = end - timedelta(days=1)
    elif period == "week":
        start = now - timedelta(days=7)
        end = now + timedelta(seconds=1)
    else:
        start = end = None

    query = (
        "SELECT title, link, description, published, source FROM news WHERE category = ?"
    )
    parameters: list[str | int] = [category]
    if start is not None and end is not None:
        query += " AND published_at >= ? AND published_at < ?"
        parameters.extend((start.isoformat(), end.isoformat()))
    query += " ORDER BY published_at DESC, rowid DESC"
    if limit is not None:
        query += " LIMIT ?"
        parameters.append(limit)
    with _connection() as connection:
        rows = connection.execute(query, parameters).fetchall()
    return [NewsItem(**dict(row)) for row in rows]


def list_notes() -> list[dict[str, str]]:
    with _connection() as connection:
        rows = connection.execute(
            "SELECT id, title, content, updated_at FROM notes ORDER BY updated_at DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def save_note(note_id: str, title: str, content: str) -> dict[str, str]:
    updated_at = datetime.now(timezone.utc).isoformat()
    with _connection() as connection:
        connection.execute(
            """
            INSERT INTO notes (id, title, content, updated_at) VALUES (?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title, content = excluded.content, updated_at = excluded.updated_at
            """,
            (note_id, title, content, updated_at),
        )
    return {"id": note_id, "title": title, "content": content, "updated_at": updated_at}


def delete_note(note_id: str) -> bool:
    with _connection() as connection:
        result = connection.execute("DELETE FROM notes WHERE id = ?", (note_id,))
    return result.rowcount > 0


def list_tasks() -> list[dict[str, str | bool]]:
    with _connection() as connection:
        rows = connection.execute(
            "SELECT id, title, completed, created_at FROM tasks ORDER BY created_at DESC"
        ).fetchall()
    return [
        {**dict(row), "completed": bool(row["completed"])}
        for row in rows
    ]


def create_task(title: str) -> dict[str, str | bool]:
    task = {
        "id": str(uuid4()),
        "title": title,
        "completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    with _connection() as connection:
        connection.execute(
            "INSERT INTO tasks (id, title, completed, created_at) VALUES (?, ?, 0, ?)",
            (task["id"], title, task["created_at"]),
        )
    return task


def update_task(task_id: str, completed: bool) -> bool:
    with _connection() as connection:
        result = connection.execute(
            "UPDATE tasks SET completed = ? WHERE id = ?",
            (int(completed), task_id),
        )
    return result.rowcount > 0


def delete_task(task_id: str) -> bool:
    with _connection() as connection:
        result = connection.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
    return result.rowcount > 0
