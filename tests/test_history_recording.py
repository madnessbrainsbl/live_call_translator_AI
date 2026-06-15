import sqlite3
import tempfile
import unittest
from pathlib import Path

import web.db as call_db
from scripts.backfill_call_history import backfill_paths


class HistoryRecordingTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self.tmp.name) / "calls.db"
        self.original_db_file = call_db.DB_FILE
        self.original_call_id = call_db._current_call_id
        self.original_pending = call_db._call_pending
        call_db.DB_FILE = str(self.db_path)
        call_db._current_call_id = None
        call_db._call_pending = {}
        call_db._init_db()

    def tearDown(self) -> None:
        call_db.DB_FILE = self.original_db_file
        call_db._current_call_id = self.original_call_id
        call_db._call_pending = self.original_pending
        self.tmp.cleanup()

    def _rows(self) -> list[sqlite3.Row]:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            return conn.execute("SELECT * FROM utterances ORDER BY id").fetchall()
        finally:
            conn.close()

    def test_record_line_accepts_s2_incoming_format(self) -> None:
        call_db._record_line("22:37:13.110 [info] 🎤 [S2 incoming] Привет")
        call_db._record_line("22:37:13.111 [info] 🌐 [S2 incoming] Привет")

        rows = self._rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["direction"], "incoming")
        self.assertEqual(rows[0]["speaker"], "them")
        self.assertEqual(rows[0]["original"], "Привет")
        self.assertEqual(rows[0]["translated"], "Привет")

    def test_record_line_accepts_legacy_outgoing_format(self) -> None:
        call_db._record_line("22:37:13.110 [info] 🎤 [outgoing] Hello")
        call_db._record_line("22:37:13.111 [info] 🌐 [outgoing] Hello")

        rows = self._rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["direction"], "outgoing")
        self.assertEqual(rows[0]["speaker"], "me")

    def test_backfill_is_idempotent_and_maps_to_existing_call(self) -> None:
        conn = sqlite3.connect(self.db_path)
        conn.execute(
            """
            INSERT INTO calls (id, started_at, ended_at, my_language, their_language)
            VALUES (10, '2026-06-03 22:37:00', '2026-06-03 22:38:00', 'ru', 'ru')
            """
        )
        conn.commit()
        conn.close()

        log_path = Path(self.tmp.name) / "speaker.log"
        log_path.write_text(
            "\n".join(
                [
                    "22:37:13.110 [info] 🎤 [S2 incoming] Один",
                    "22:37:13.111 [info] 🌐 [S2 incoming] Один",
                ]
            ),
            encoding="utf-8",
        )

        self.assertEqual(backfill_paths(self.db_path, [log_path]), 1)
        self.assertEqual(backfill_paths(self.db_path, [log_path]), 0)

        rows = self._rows()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["call_id"], 10)
        self.assertEqual(rows[0]["original"], "Один")


if __name__ == "__main__":
    unittest.main()
