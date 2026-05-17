from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]


class TranscriptOnlyModeTests(unittest.TestCase):
    def test_toolbar_has_translation_toggle(self) -> None:
        index_html = (PROJECT_ROOT / "web/templates/index.html").read_text(encoding="utf-8")

        self.assertIn('id="btn-transcript-only"', index_html)
        self.assertIn("toggleTranscriptOnly()", index_html)
        self.assertRegex(index_html, r'id="btn-transcript-only"[\s\S]*>\s*T\s*</button>')

    def test_web_ui_displays_transcript_without_translation(self) -> None:
        app_js = (PROJECT_ROOT / "web/static/js/app.js").read_text(encoding="utf-8")

        self.assertIn("let transcriptOnlyMode = false;", app_js)
        self.assertIn("translation_enabled: !transcriptOnlyMode", app_js)
        self.assertIn("sendCmd(transcriptOnlyMode ? 'translation_off' : 'translation_on')", app_js)
        self.assertIn("processLine('\\uD83C\\uDF10 [' + direction + '] ' + text);", app_js)
        self.assertIn("(pending.transcript || pending.translation || '')", app_js)
        self.assertIn("const SAME_LANGUAGE_TRANSLATION_HINT", app_js)
        self.assertIn("function isSameLanguageTranslationPair()", app_js)
        self.assertIn("showToast(SAME_LANGUAGE_TRANSLATION_HINT);", app_js)

    def test_engine_can_disable_translation_without_groq(self) -> None:
        engine_rs = (PROJECT_ROOT / "native/audio_engine/src/engine.rs").read_text(
            encoding="utf-8"
        )
        translation_rs = (
            PROJECT_ROOT / "native/audio_engine/src/translation/mod.rs"
        ).read_text(encoding="utf-8")
        command_server = (PROJECT_ROOT / "lib/translator/command_server.ex").read_text(
            encoding="utf-8"
        )

        self.assertIn('const CONFIG_TRANSLATION_ENABLED: &str = "translation_enabled";', engine_rs)
        self.assertIn("TranslationEngine::disabled()", engine_rs)
        self.assertIn("translation_is_disabled || same_language", engine_rs)
        self.assertIn("pub fn disabled() -> Self", translation_rs)
        self.assertIn('defp handle_command("translation_off")', command_server)
        self.assertIn('defp handle_command("translation_on")', command_server)


if __name__ == "__main__":
    unittest.main()
