from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class CrossTalkFilterTests(unittest.TestCase):
    def test_ui_removes_microphone_echo_fragments_from_incoming_speech(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("function isLikelyCrossTalkEcho(fragmentText, sourceText, maxAgeMs)", app_js)
        self.assertIn("function removeEarlierCrossTalkFragments(current)", app_js)
        self.assertIn("current.direction !== 'incoming'", app_js)
        self.assertIn("message.direction === 'outgoing'", app_js)
        self.assertIn("now - message.at <= CROSSTALK_EARLIER_ECHO_WINDOW_MS", app_js)
        self.assertIn("removeEarlierCrossTalkFragments(currentMessage);", app_js)

    def test_ui_suppresses_late_opposite_direction_echo(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn(
            "if (age <= CROSSTALK_LATE_ECHO_WINDOW_MS && isCrossTalkEcho(current, recent, age))",
            app_js,
        )

    def test_ui_filters_approximate_word_overlap_echoes(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("function hasStrongWordOverlap(fragment, source)", app_js)
        self.assertIn("const CROSSTALK_WORD_OVERLAP_MIN_RATIO = 0.72;", app_js)
        self.assertIn("overlap / fragmentWords.length >= CROSSTALK_WORD_OVERLAP_MIN_RATIO", app_js)
        self.assertIn("textsLookAlike(fragment, source) || hasStrongWordOverlap(fragment, source)", app_js)


if __name__ == "__main__":
    unittest.main()
