"""Backfill call utterances from existing translator logs.

The live DB writer already creates calls. This script only fills missing
utterances into calls whose time window contains the log speech event.
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from dataclasses import dataclass
from datetime import datetime, time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from web.db import _parse_line  # noqa: E402
from web.settings import DB_FILE  # noqa: E402


@dataclass(frozen=True)
class CallWindow:
    id: int
    started_at: datetime
    ended_at: datetime


@dataclass(frozen=True)
class ParsedUtterance:
    log_time: time
    direction: str
    original: str
    translated: str


def _parse_db_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    normalized = str(value).replace("T", " ")
    return datetime.strptime(normalized[:19], "%Y-%m-%d %H:%M:%S")


def _load_call_windows(conn: sqlite3.Connection) -> list[CallWindow]:
    rows = conn.execute("SELECT id, started_at, ended_at FROM calls ORDER BY id").fetchall()
    windows: list[CallWindow] = []
    now = datetime.now()
    for row in rows:
        started = _parse_db_datetime(row["started_at"])
        if not started:
            continue
        ended = _parse_db_datetime(row["ended_at"]) or now
        windows.append(CallWindow(id=int(row["id"]), started_at=started, ended_at=ended))
    return windows


def _log_time_from_event_ts(ts: str) -> time:
    return datetime.strptime(ts[-8:], "%H:%M:%S").time()


def parse_log_file(path: Path) -> list[ParsedUtterance]:
    pending: dict[str, tuple[str, time]] = {}
    utterances: list[ParsedUtterance] = []

    with path.open("r", encoding="utf-8", errors="replace") as handle:
        for raw_line in handle:
            event = _parse_line(raw_line.strip())
            if not event:
                continue
            direction = event["direction"]
            event_time = _log_time_from_event_ts(event["ts"])
            if event["kind"] == "transcript":
                pending[direction] = (event["text"], event_time)
                continue
            previous = pending.pop(direction, None)
            if previous:
                original, original_time = previous
                utterances.append(
                    ParsedUtterance(
                        log_time=original_time,
                        direction=direction,
                        original=original,
                        translated=event["text"],
                    )
                )

    return utterances


def _candidate_timestamp(call: CallWindow, log_time: time) -> datetime:
    return datetime.combine(call.started_at.date(), log_time)


def _find_call(call_windows: list[CallWindow], utterance: ParsedUtterance) -> tuple[int, datetime] | None:
    for call in call_windows:
        candidate = _candidate_timestamp(call, utterance.log_time)
        if call.started_at <= candidate <= call.ended_at:
            return call.id, candidate
    return None


def _utterance_exists(conn: sqlite3.Connection, call_id: int, utterance: ParsedUtterance) -> bool:
    row = conn.execute(
        """
        SELECT id FROM utterances
        WHERE call_id = ? AND direction = ? AND original = ? AND translated = ?
        LIMIT 1
        """,
        (call_id, utterance.direction, utterance.original, utterance.translated),
    ).fetchone()
    return row is not None


def backfill_paths(db_path: Path, log_paths: list[Path]) -> int:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    inserted = 0
    try:
        call_windows = _load_call_windows(conn)
        for path in log_paths:
            for utterance in parse_log_file(path):
                matched = _find_call(call_windows, utterance)
                if not matched:
                    continue
                call_id, ts = matched
                if _utterance_exists(conn, call_id, utterance):
                    continue
                speaker = "me" if utterance.direction == "outgoing" else "them"
                conn.execute(
                    """
                    INSERT INTO utterances
                    (call_id, ts, direction, speaker, original, translated)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (
                        call_id,
                        ts.strftime("%Y-%m-%d %H:%M:%S"),
                        utterance.direction,
                        speaker,
                        utterance.original,
                        utterance.translated,
                    ),
                )
                inserted += 1
        conn.commit()
        return inserted
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill call history utterances from log files.")
    parser.add_argument("logs", nargs="+", type=Path, help="Log files to parse")
    parser.add_argument("--db", type=Path, default=Path(DB_FILE), help="SQLite calls.db path")
    args = parser.parse_args()

    inserted = backfill_paths(args.db, args.logs)
    print(f"Inserted {inserted} utterances")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
