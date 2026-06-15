from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class HistoryExportStaticTests(unittest.TestCase):
    def test_history_detail_has_export_without_resuming_engine(self) -> None:
        history_html = (PROJECT_ROOT / "web/templates/history.html").read_text(
            encoding="utf-8"
        )

        self.assertIn('id="btn-export-call"', history_html)
        self.assertIn("function exportCurrentCall()", history_html)
        self.assertIn("function buildCallExportText(call, utterances)", history_html)
        self.assertIn("function downloadTextFile(filename, text)", history_html)
        self.assertIn("const EXPORT_MIME_TYPE = 'text/plain;charset=utf-8';", history_html)
        self.assertIn("&#9654; Resume Live", history_html)
        self.assertIn("const CALL_SUMMARY_PREVIEW_CHARS = 150;", history_html)
        self.assertIn("escHtml(summaryPreview)", history_html)

    def test_history_export_avoids_duplicate_transcript_only_lines(self) -> None:
        history_html = (PROJECT_ROOT / "web/templates/history.html").read_text(
            encoding="utf-8"
        )

        self.assertIn("function textsAreSame(a, b)", history_html)
        self.assertIn("const showOriginal = original && !textsAreSame(original, translated);", history_html)
        self.assertIn(
            "if (translated && !textsAreSame(original, translated)) lines.push",
            history_html,
        )


if __name__ == "__main__":
    unittest.main()
