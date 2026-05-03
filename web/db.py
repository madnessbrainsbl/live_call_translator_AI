"""Call database: schema, CRUD, live call tracking."""

import re
import time
import sqlite3
import threading
import logging

from .settings import DB_FILE, CALL_IDLE_TIMEOUT, load_settings

logger = logging.getLogger("translator")


# ── DB access ────────────────────────────────────────────────────

def _get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _init_db():
    conn = _get_db()
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS calls (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at  TEXT NOT NULL,
            ended_at    TEXT,
            my_language TEXT,
            their_language TEXT,
            summary     TEXT
        );
        CREATE TABLE IF NOT EXISTS utterances (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            call_id  INTEGER NOT NULL REFERENCES calls(id),
            ts       TEXT NOT NULL,
            direction TEXT NOT NULL,
            speaker  TEXT NOT NULL,
            original TEXT,
            translated TEXT
        );
    """)
    conn.close()


_init_db()

# Close any orphaned calls from previous run (app quit without Stop)
_conn = _get_db()
_conn.execute(
    "UPDATE calls SET ended_at = ? WHERE ended_at IS NULL",
    (time.strftime("%Y-%m-%d %H:%M:%S"),),
)
_conn.commit()
_conn.close()

# Live call tracking (single-user app -> simple global state)
_call_lock = threading.Lock()
_current_call_id = None
_call_last_activity = 0
_call_pending = {}  # direction -> {"transcript": ..., "ts": ...}

_LINE_TRANSCRIPT = re.compile(r".*\U0001F3A4 \[(outgoing|incoming)\] (.+)")
_LINE_TRANSLATION = re.compile(r".*\U0001F310 \[(outgoing|incoming)\] (.+)")


def _ensure_call():
    """Return current call_id, creating a new call if needed."""
    global _current_call_id, _call_last_activity
    now = time.time()
    # Auto-close stale call
    if _current_call_id and (now - _call_last_activity > CALL_IDLE_TIMEOUT):
        _close_call()
    if not _current_call_id:
        settings = load_settings()
        conn = _get_db()
        cur = conn.execute(
            "INSERT INTO calls (started_at, my_language, their_language) VALUES (?, ?, ?)",
            (time.strftime("%Y-%m-%d %H:%M:%S"), settings.get("my_language", ""), settings.get("their_language", "")),
        )
        conn.commit()
        _current_call_id = cur.lastrowid
        conn.close()
    _call_last_activity = now
    return _current_call_id


def _close_call():
    global _current_call_id, _call_pending
    if _current_call_id:
        conn = _get_db()
        conn.execute("UPDATE calls SET ended_at = ? WHERE id = ?",
                      (time.strftime("%Y-%m-%d %H:%M:%S"), _current_call_id))
        conn.commit()
        conn.close()
    _current_call_id = None
    _call_pending = {}


def _resume_call(call_id):
    """Make an existing call the live append target."""
    global _current_call_id, _call_last_activity, _call_pending
    with _call_lock:
        conn = _get_db()
        row = conn.execute("SELECT id FROM calls WHERE id = ?", (call_id,)).fetchone()
        if not row:
            conn.close()
            return False

        if _current_call_id and _current_call_id != call_id:
            conn.execute(
                "UPDATE calls SET ended_at = ? WHERE id = ?",
                (time.strftime("%Y-%m-%d %H:%M:%S"), _current_call_id),
            )

        conn.execute("UPDATE calls SET ended_at = NULL WHERE id = ?", (call_id,))
        conn.commit()
        conn.close()

        _current_call_id = call_id
        _call_last_activity = time.time()
        _call_pending = {}
        return True


def _record_line(line):
    """Parse a log line and write utterance to DB if it completes a pair."""
    global _call_pending
    m = _LINE_TRANSCRIPT.match(line)
    if m:
        direction, text = m.group(1), m.group(2)
        with _call_lock:
            _call_pending[direction] = {"transcript": text, "ts": time.strftime("%Y-%m-%d %H:%M:%S")}
        return
    m = _LINE_TRANSLATION.match(line)
    if m:
        direction, text = m.group(1), m.group(2)
        with _call_lock:
            prev = _call_pending.pop(direction, None)
            if prev:
                call_id = _ensure_call()
                speaker = "me" if direction == "outgoing" else "them"
                conn = _get_db()
                conn.execute(
                    "INSERT INTO utterances (call_id, ts, direction, speaker, original, translated) VALUES (?, ?, ?, ?, ?, ?)",
                    (call_id, prev["ts"], direction, speaker, prev["transcript"], text),
                )
                conn.commit()
                conn.close()
