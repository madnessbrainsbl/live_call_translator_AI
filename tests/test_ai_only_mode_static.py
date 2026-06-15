from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class AiOnlyModeStaticTests(unittest.TestCase):
    def test_toolbar_has_ai_only_toggle(self) -> None:
        index_html = (PROJECT_ROOT / "web/templates/index.html").read_text(encoding="utf-8")

        self.assertIn('id="btn-hide-transcript"', index_html)
        self.assertIn("toggleTranscriptHidden()", index_html)
        self.assertIn("AI Only", index_html)
        self.assertIn("keep AI Assistant context", index_html)

    def test_transcript_hidden_mode_is_visual_only(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")
        style_css = (PROJECT_ROOT / "web/static/css/style.css").read_text(encoding="utf-8")

        self.assertIn("let transcriptHiddenMode = false;", app_js)
        self.assertIn("function toggleTranscriptHidden()", app_js)
        self.assertIn("function updateTranscriptHiddenMode()", app_js)
        self.assertIn("chat.classList.toggle('transcript-hidden', transcriptHiddenMode);", app_js)
        self.assertIn("transcript_hidden_mode: transcriptHiddenMode", app_js)
        self.assertIn("transcriptHiddenMode = !!s.transcript_hidden_mode;", app_js)
        self.assertIn(".chat.transcript-hidden .msg", style_css)
        self.assertIn(".chat.transcript-hidden .direction-label", style_css)
        self.assertIn(".chat.transcript-hidden .time-sep", style_css)
        self.assertIn(".chat.transcript-hidden .assistant-msg", style_css)
        self.assertIn("align-self: stretch;", style_css)
        self.assertIn("max-width: none;", style_css)
        self.assertIn("width: 100%;", style_css)

    def test_settings_default_contains_ai_only_flag(self) -> None:
        settings_py = (PROJECT_ROOT / "web/settings.py").read_text(encoding="utf-8")

        self.assertIn('"transcript_hidden_mode": False', settings_py)

    def test_live_export_avoids_duplicate_transcript_only_lines(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("function pushExportMessage(lines, message)", app_js)
        self.assertIn("function messageTextsAreSame(left, right)", app_js)
        self.assertIn("const sameText = messageTextsAreSame(transcript, translation);", app_js)
        self.assertIn("if (translation && !sameText)", app_js)
        self.assertIn("normalizeMessageText(left) === normalizeMessageText(right)", app_js)


if __name__ == "__main__":
    unittest.main()
