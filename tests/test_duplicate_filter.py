from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class DuplicateFilterTests(unittest.TestCase):
    def test_same_direction_duplicates_use_short_window(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("const SAME_DIRECTION_DUPLICATE_WINDOW_MS = 1_000;", app_js)
        self.assertIn("if (recent.direction === current.direction) {", app_js)
        self.assertIn(
            "age <= SAME_DIRECTION_DUPLICATE_WINDOW_MS && messagesLookAlike(recent, current)",
            app_js,
        )
        self.assertIn("continue;", app_js)

    def test_cross_direction_echo_filter_keeps_longer_window(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn(
            "age <= CROSSTALK_LATE_ECHO_WINDOW_MS && recent.direction !== current.direction",
            app_js,
        )
        self.assertIn("isCrossTalkEcho(current, recent, age)", app_js)


if __name__ == "__main__":
    unittest.main()
